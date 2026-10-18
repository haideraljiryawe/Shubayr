import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  API,
  awaitQuota,
  bearer,
  customerAddress,
  customerToken,
  requireLiveApi,
  signIn,
  staffToken,
} from "./live-api";

/**
 * Returns v2 on the store against the real API: the customer requests a
 * return of a piece line and part of a weighed line through the form (the
 * request carries an operation id and the exact typed weight), then follows
 * it on the return's own page as staff approve, receive, inspect and refund
 * it — each status in plain words, and the refund the API worked out.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live returns spec");
  await awaitQuota(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const SELLABLE = "90000000-0000-4000-8000-000000000002";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

async function staff(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await staffToken(request)), data });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

async function product(request: APIRequestContext, kind: "piece" | "kg") {
  const created = await staff(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Live return ${kind} ${run}`,
    name_ar: `مرتجع حي ${kind} ${run}`,
    price: kind === "piece" ? 15000 : 6000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku: `WEB-RET-${kind.toUpperCase()}-${run}-${Math.random().toString(36).slice(2, 5)}`, base_unit: kind, whole_units_only: kind === "piece", pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await staff(request, "POST", "/admin/inventory/openings", {
    operation_id: `web-ret-open-${kind}-${run}-${Math.random().toString(36).slice(2)}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: SELLABLE, quantity: "10", unit_cost_iqd: "3000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  return { id: created.body.id as string, variant };
}

/** Two pieces and 1.5 kg for this worker's customer, delivered by an external driver and paid in full. */
async function deliveredOrder(request: APIRequestContext) {
  const piece = await product(request, "piece");
  const kg = await product(request, "kg");
  const headers = bearer(await customerToken(request));
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  for (const [item, quantity] of [
    [piece, 2],
    [kg, 1.5],
  ] as const) {
    const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: item.id, variant_id: item.variant, quantity } });
    expect(added.ok(), await added.text()).toBe(true);
  }
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `web-ret-${run}-${Math.random()}` },
    data: { address_id: await customerAddress(request), payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const order = await placed.json();
  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const { body } = await staff(request, "GET", `/admin/orders/${order.id}`);
    const moved = await staff(request, "PATCH", `/admin/orders/${order.id}/status`, {
      status,
      version: body.version,
      ...(status === "confirmed" ? { customer_contacted: true, customer_contact_note: "Customer confirmed by phone" } : {}),
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
  }
  const driver = await staff(request, "POST", "/admin/external-drivers", {
    name: `Web returns driver ${run}`,
    phone: `+9647${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
  });
  expect(driver.status, JSON.stringify(driver.body)).toBe(201);
  expect((await staff(request, "PATCH", `/deliveries/${order.delivery_id}/assign`, { party_id: driver.body.id })).status).toBe(200);
  let { body } = await staff(request, "GET", `/admin/orders/${order.id}`);
  expect((await staff(request, "PATCH", `/admin/orders/${order.id}/status`, { status: "dispatched", version: body.version })).status).toBe(200);
  ({ body } = await staff(request, "GET", `/admin/orders/${order.id}`));
  const done = await staff(request, "PATCH", `/admin/deliveries/${order.delivery_id}/status`, {
    status: "delivered",
    order_version: body.version,
    operation_id: `web-ret-dlv-${run}-${Math.random()}`,
    collection_confirmation: "confirmed",
    collected_amount: String(order.total),
    source: "web_admin",
  });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  const items = (await staff(request, "GET", `/admin/orders/${order.id}`)).body.items as Array<{ id: string; variant_id: string }>;
  return {
    id: order.id as string,
    orderNumber: order.order_number as string,
    piece: items.find((line) => line.variant_id === piece.variant)!.id,
    kg: items.find((line) => line.variant_id === kg.variant)!.id,
  };
}

/** A staff step on the return, posted once with its own operation id. */
async function step(request: APIRequestContext, id: string, action: string, body: Record<string, unknown>) {
  const result = await staff(request, "POST", `/returns/${id}/${action}`, {
    operation_id: `web-ret-${action}-${run}-${Math.random().toString(36).slice(2)}`,
    document_date: today(),
    ...body,
  });
  expect(result.status, `${action}: ${JSON.stringify(result.body)}`).toBe(200);
  return result.body;
}

test("a customer requests a return by piece and by weight, then follows it to the refund", async ({ page, request }) => {
  const order = await deliveredOrder(request);

  await signIn(page, `/account/orders/${order.id}/return`);
  await expect(page.getByTestId("return-form")).toBeVisible();
  await page.getByTestId(`return-check-${order.piece}`).check();
  await page.getByTestId(`return-line-reason-${order.piece}`).fill("Arrived scratched");
  await page.getByTestId(`return-check-${order.kg}`).check();
  const weight = page.getByTestId(`return-qty-input-${order.kg}`);
  await expect(weight).toHaveValue("1.5");
  await weight.fill("0.25");
  await page.getByTestId(`return-line-reason-${order.kg}`).fill("Bought too much");

  const [sent] = await Promise.all([
    page.waitForRequest((candidate) => candidate.method() === "POST" && new URL(candidate.url()).pathname.endsWith("/returns")),
    page.getByTestId("return-submit").click(),
  ]);
  const payload = sent.postDataJSON() as { operation_id: string; items: Array<{ order_item_id: string; quantity: number }> };
  expect(payload.operation_id.length).toBeGreaterThanOrEqual(8);
  expect(payload.items.find((line) => line.order_item_id === order.piece)?.quantity).toBe(1);
  expect(payload.items.find((line) => line.order_item_id === order.kg)?.quantity).toBe(0.25);

  await page.waitForURL(/\/account\/returns$/);
  const mine = await (await request.get(`${API}/returns?per_page=10`, { headers: bearer(await customerToken(request)) })).json();
  const created = (mine.data as Array<{ id: string; order_id: string; items: Array<{ id: string; order_item_id: string; quantity: number }> }>).find((entry) => entry.order_id === order.id)!;
  expect(created, "the new return").toBeTruthy();
  await expect(page.getByTestId(`return-status-${created.id}`)).toHaveText("قيد المراجعة");

  await page.getByTestId(`return-details-${created.id}`).click();
  await expect(page.getByTestId("return-detail")).toHaveAttribute("data-status", "requested");
  await expect(page.getByTestId("return-detail-explain")).toContainText("سنراجعه قريبًا");
  await expect(page.getByTestId("return-detail-order")).toHaveText(order.orderNumber);

  // Staff approve all of it, then receive, inspect and refund.
  const pieceLine = created.items.find((line) => line.order_item_id === order.piece)!;
  const kgLine = created.items.find((line) => line.order_item_id === order.kg)!;
  await step(request, created.id, "approve", {
    decision: "approve",
    items: [
      { return_item_id: pieceLine.id, approved_quantity: 1 },
      { return_item_id: kgLine.id, approved_quantity: 0.25 },
    ],
  });
  await page.reload();
  await expect(page.getByTestId("return-detail-status")).toHaveText("تمت الموافقة");
  await expect(page.getByTestId(`return-detail-item-${kgLine.id}`).getByTestId("return-detail-accepted")).toHaveText("0.25 kg");

  await step(request, created.id, "receive", {});
  await page.reload();
  await expect(page.getByTestId("return-detail-status")).toHaveText("تم الاستلام");
  await expect(page.getByTestId("return-stage-received")).toHaveAttribute("data-state", "done");

  await step(request, created.id, "inspect", {
    items: [
      { return_item_id: pieceLine.id, condition: "sellable", location_id: SELLABLE },
      { return_item_id: kgLine.id, condition: "sellable", location_id: SELLABLE },
    ],
  });
  const account = await staff(request, "POST", "/admin/cash-accounts", { name: `Web returns till ${run}`, kind: "cash", currency_code: "IQD" });
  expect(account.status, JSON.stringify(account.body)).toBe(201);
  const refunded = await step(request, created.id, "refund", { method: "cash_account", cash_account_id: account.body.id });

  await page.reload();
  await expect(page.getByTestId("return-detail")).toHaveAttribute("data-status", "refunded");
  await expect(page.getByTestId("return-detail-explain")).toContainText("دُفع لك المبلغ المسترد");
  await expect(page.getByTestId("return-detail-paid-how")).toContainText("دُفع نقدًا");
  const digits = (text: string | null) => (text ?? "").replace(/[^\d]/g, "");
  expect(digits(await page.getByTestId("return-detail-cash").textContent())).toBe(String(refunded.cash_refund_amount));
  await expect(page.getByTestId("return-detail-event")).toHaveCount(5);
});
