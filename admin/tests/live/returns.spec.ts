import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  API,
  KNOWN_PASSWORD,
  activateStaff,
  adminApiToken,
  bearer,
  CUSTOMER_PHONE,
  createStaff,
  phoneToken,
  randomWorkPhone,
  requireLiveApi,
  servedAddressId,
  switchUser,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Customer returns v2 (contract 17.0, phase 9) in the Web Admin, against a
 * real API: a customer returns a piece line and a weighed line of a delivered
 * order; staff approve part of it (whole pieces, exact kilograms), receive
 * it, inspect each line into a location that fits its condition, and refund
 * it from a cash account — then the money, points and timeline the API
 * reports are on the page. Refusals come back in words: a step someone else
 * already took, a delivery-fee refund over the fee charged. A step is only
 * offered to whoever holds its permission.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const WAREHOUSE = "90000000-0000-4000-8000-000000000001";
const SELLABLE = "90000000-0000-4000-8000-000000000002";

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

interface Stocked {
  id: string;
  variant: string;
}

const stocked = new Map<string, Stocked>();

/** A published one-SKU product with opening stock: pieces, or by the kilogram. */
async function product(request: APIRequestContext, kind: "piece" | "kg"): Promise<Stocked> {
  const cached = stocked.get(kind);
  if (cached) return cached;
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Return ${kind} ${run}`,
    name_ar: `مرتجع ${kind} ${run}`,
    price: kind === "piece" ? 20000 : 8000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku: `RET-${kind.toUpperCase()}-${run}`, base_unit: kind, whole_units_only: kind === "piece", pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `ret-open-${kind}-${run}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: SELLABLE, quantity: "30", unit_cost_iqd: kind === "piece" ? "9000" : "4000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  const result = { id: created.body.id as string, variant };
  stocked.set(kind, result);
  return result;
}

let quarantine: { id: string; code: string } | null = null;

/** A non-sellable location for damaged returns; the seed has only a sellable one. */
async function quarantineLocation(request: APIRequestContext) {
  if (quarantine) return quarantine;
  const code = `Q-${run}`.slice(0, 40);
  const created = await api(request, "POST", `/admin/inventory/warehouses/${WAREHOUSE}/locations`, {
    code,
    description: "Returns quarantine (admin live)",
    is_sellable: false,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  quarantine = { id: created.body.id as string, code };
  return quarantine;
}

let till: { id: string; name: string } | null = null;

async function cashAccount(request: APIRequestContext) {
  if (till) return till;
  const name = `Returns till ${run}`;
  const created = await api(request, "POST", "/admin/cash-accounts", { name, kind: "cash", currency_code: "IQD" });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  till = { id: created.body.id as string, name };
  return till;
}

interface Delivered {
  id: string;
  order_number: string;
  total: number;
  delivery_fee: number;
  lines: Record<"piece" | "kg", string>;
}

/** Two pieces and 1.5 kg, ordered by the seeded customer, delivered and paid in full. */
async function deliveredOrder(request: APIRequestContext): Promise<Delivered> {
  const piece = await product(request, "piece");
  const kg = await product(request, "kg");
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addressId = await servedAddressId(request, headers, CUSTOMER_PHONE);
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
    headers: { ...headers, "Idempotency-Key": `ret-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const order = await placed.json();

  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
    const moved = await api(request, "PATCH", `/admin/orders/${order.id}/status`, {
      status,
      version: body.version,
      ...(status === "confirmed" ? { customer_contacted: true, customer_contact_note: "Customer confirmed by phone" } : {}),
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
  }
  const driver = await api(request, "POST", "/admin/external-drivers", { name: `Returns driver ${run}`, phone: randomWorkPhone() });
  expect(driver.status, JSON.stringify(driver.body)).toBe(201);
  expect((await api(request, "PATCH", `/deliveries/${order.delivery_id}/assign`, { party_id: driver.body.id })).status).toBe(200);
  let { body } = await api(request, "GET", `/admin/orders/${order.id}`);
  expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status: "dispatched", version: body.version })).status).toBe(200);
  ({ body } = await api(request, "GET", `/admin/orders/${order.id}`));
  const done = await api(request, "PATCH", `/admin/deliveries/${order.delivery_id}/status`, {
    status: "delivered",
    order_version: body.version,
    operation_id: `ret-dlv-${run}-${Math.random()}`,
    collection_confirmation: "confirmed",
    collected_amount: String(order.total),
    source: "web_admin",
  });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  ({ body } = await api(request, "GET", `/admin/orders/${order.id}`));
  const lineOf = (variant: string) => (body.items as Array<{ id: string; variant_id: string }>).find((line) => line.variant_id === variant)!.id;
  return {
    id: order.id,
    order_number: order.order_number,
    total: order.total,
    delivery_fee: body.delivery_fee as number,
    lines: { piece: lineOf(piece.variant), kg: lineOf(kg.variant) },
  };
}

/** The customer asks to return both pieces (defective) and 0.5 kg (changed their mind). */
async function requestReturn(request: APIRequestContext, order: Delivered): Promise<{ id: string; document_number: string; items: Array<{ id: string; order_item_id: string }> }> {
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const created = await request.post(`${API}/returns`, {
    headers,
    data: {
      operation_id: `ret-req-${run}-${Math.random().toString(36).slice(2)}`,
      order_id: order.id,
      reason: "Admin live return",
      items: [
        { order_item_id: order.lines.piece, quantity: 2, reason_code: "defect", reason: "Screen cracked" },
        { order_item_id: order.lines.kg, quantity: 0.5, reason_code: "change_of_mind", reason: "Too much" },
      ],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  return created.json();
}

async function openReturn(page: Page, order: Delivered) {
  await page.goto(`/returns?q=${encodeURIComponent(order.order_number)}`);
  await expect(page.getByTestId("returns-order-filter")).toContainText(order.order_number);
  const rows = page.getByTestId("returns-table").getByTestId("return-link");
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await expect(page.getByTestId("return-view")).toBeVisible();
}

test("approve part, receive, inspect into fitting locations and refund in cash — with the API's money on the page", async ({ page, request }) => {
  const order = await deliveredOrder(request);
  const created = await requestReturn(request, order);
  const pieceLine = created.items.find((line) => line.order_item_id === order.lines.piece)!.id;
  const kgLine = created.items.find((line) => line.order_item_id === order.lines.kg)!.id;
  const bin = await quarantineLocation(request);
  const account = await cashAccount(request);

  await uiLoginAsAdmin(page);
  await openReturn(page, order);
  await expect(page.getByTestId("return-number")).toHaveText(created.document_number);
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "requested");
  await expect(page.getByTestId("return-step-approve")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("return-customer")).toContainText(CUSTOMER_PHONE);

  // Approve: whole pieces only, no more than requested, exact kilograms.
  const panel = page.getByTestId("return-approve-panel");
  await panel.getByTestId(`return-approve-qty-${pieceLine}`).fill("1.5");
  await panel.getByTestId(`return-approve-qty-${kgLine}`).fill("0.6");
  await panel.getByTestId("return-approve-submit").click();
  await expect(panel).toContainText("هذا المنتج يُباع بالقطعة الكاملة");
  await expect(panel).toContainText("لا تتجاوز المطلوب");
  await panel.getByTestId(`return-approve-qty-${pieceLine}`).fill("1");
  await panel.getByTestId(`return-approve-qty-${kgLine}`).fill("0.25");
  await panel.getByTestId("return-approve-submit").click();
  await expect(page.getByTestId("return-notice")).toHaveAttribute("data-step", "approve");
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "partially_approved");
  await expect(page.getByTestId("return-step-receive")).toHaveAttribute("data-state", "current");
  const lines = page.getByTestId("return-lines");
  await expect(lines.locator(`[data-item="${pieceLine}"]`).getByTestId("return-line-approved")).toHaveText("1");
  await expect(lines.locator(`[data-item="${kgLine}"]`).getByTestId("return-line-approved")).toHaveText("0.25 kg");

  // Receive.
  await page.getByTestId("return-receive-submit").click();
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "received");

  // Inspect: the piece is sellable (a sellable location), the rice damaged (a non-sellable one).
  const inspect = page.getByTestId("return-inspect-panel");
  await inspect.getByTestId(`return-inspect-condition-${pieceLine}`).selectOption("sellable");
  const pieceLocations = inspect.getByTestId(`return-inspect-location-${pieceLine}`);
  await expect(pieceLocations.locator(`option[value="${bin.id}"]`)).toHaveCount(0);
  await pieceLocations.selectOption(SELLABLE);
  await inspect.getByTestId(`return-inspect-condition-${kgLine}`).selectOption("damaged");
  const kgLocations = inspect.getByTestId(`return-inspect-location-${kgLine}`);
  await expect(kgLocations.locator(`option[value="${SELLABLE}"]`)).toHaveCount(0);
  await kgLocations.selectOption(bin.id);
  await inspect.getByTestId("return-inspect-submit").click();
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "inspected");
  await expect(lines.locator(`[data-item="${kgLine}"]`).getByTestId("return-line-inspection")).toContainText(bin.code);

  // Refund from the till, once, even when clicked twice.
  const refund = page.getByTestId("return-refund-panel");
  await refund.getByTestId("return-refund-cash-account").selectOption(account.id);
  await refund.getByTestId("return-refund-submit").dblclick();
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "refunded");
  await expect(page.getByTestId("return-step-refund")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("return-payment")).toHaveCount(1);
  await expect(page.getByTestId("return-payment")).toContainText(account.name);
  await expect(page.getByTestId("return-event")).toHaveCount(5);
  await expect(page.getByTestId("return-postings")).toBeVisible();

  // The page shows exactly what the API computed.
  const { body } = await api(request, "GET", `/returns/queue/${created.id}`);
  expect(body.status).toBe("refunded");
  expect(body.refund_payments).toHaveLength(1);
  expect(body.items.find((line: { id: string }) => line.id === pieceLine).approved_quantity).toBe(1);
  expect(body.items.find((line: { id: string }) => line.id === kgLine).approved_quantity).toBe(0.25);
  expect(body.items.find((line: { id: string }) => line.id === kgLine).condition).toBe("damaged");
  const digits = (text: string | null) => (text ?? "").replace(/[^\d]/g, "");
  expect(digits(await page.getByTestId("return-cash-refund").textContent())).toBe(String(body.cash_refund_amount));
  expect(digits(await page.getByTestId("return-refund-amount").textContent())).toBe(String(body.refund_amount));
  await expect(page.getByTestId("return-points")).toContainText(String(body.points_effect.net));
});

test("refusals in words: a step someone else already took, a fee refund over the fee charged", async ({ page, request }) => {
  const order = await deliveredOrder(request);
  const created = await requestReturn(request, order);

  await uiLoginAsAdmin(page);
  await openReturn(page, order);
  const panel = page.getByTestId("return-approve-panel");

  // More delivery fee than was charged: the API refuses with its own code.
  await panel.getByTestId("return-fee-override").check();
  await panel.getByTestId("return-fee-amount").fill(String(order.delivery_fee + 1000));
  await panel.getByTestId("return-fee-reason").fill("Courier damaged the box");
  await panel.getByTestId("return-approve-submit").click();
  await expect(page.getByTestId("return-refusal")).toHaveAttribute("data-code", "RETURN_DELIVERY_FEE_EXCEEDS_CHARGED");
  await expect(page.getByTestId("return-refusal")).toContainText("أكثر من أجرة التوصيل المدفوعة");
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "requested");

  // Someone else rejects it meanwhile; this page's approval is then refused.
  const rejected = await api(request, "POST", `/returns/${created.id}/approve`, {
    operation_id: `ret-reject-${run}-${Math.random().toString(36).slice(2)}`,
    document_date: today(),
    decision: "reject",
    note: "Rejected elsewhere",
  });
  expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
  await panel.getByTestId("return-fee-override").uncheck();
  await panel.getByTestId("return-approve-submit").click();
  await expect(page.getByTestId("return-refusal")).toHaveAttribute("data-code", "RETURN_INVALID_STATE");
  await expect(page.getByTestId("return-refusal")).toContainText("أعد تحميل الصفحة");

  await page.reload();
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "rejected");
  await expect(page.getByTestId("return-step-receive")).toHaveAttribute("data-state", "skipped");
  await expect(page.getByTestId("return-approve-panel")).toHaveCount(0);
  await expect(page.getByTestId("return-event").last()).toContainText("Rejected elsewhere");
});

test("each step only for its permission: a receiver sees no approval, then receives", async ({ page, request }) => {
  const order = await deliveredOrder(request);
  const created = await requestReturn(request, order);
  const receiver = await activateStaff(request, await createStaff(request, { permissionKeys: ["returns.receive"], prefix: "ret-recv" }));

  await switchUser(page, receiver.username, KNOWN_PASSWORD);
  await page.goto(`/returns/${created.id}`);
  await expect(page.getByTestId("return-view")).toBeVisible();
  await expect(page.getByTestId("return-approve-panel")).toHaveCount(0);
  await expect(page.getByTestId("return-waiting")).toHaveAttribute("data-step", "approve");
  await expect(page.getByTestId("return-waiting")).toContainText("returns.approve");
  // Without orders.view the customer is not shown.
  await expect(page.getByTestId("return-customer")).toHaveCount(0);

  const approved = await api(request, "POST", `/returns/${created.id}/approve`, {
    operation_id: `ret-approve-${run}-${Math.random().toString(36).slice(2)}`,
    document_date: today(),
    decision: "approve",
    items: created.items.map((line) => ({ return_item_id: line.id, approved_quantity: line.order_item_id === order.lines.piece ? 2 : 0.5 })),
  });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  await page.reload();
  await page.getByTestId("return-receive-submit").click();
  await expect(page.getByTestId("return-status")).toHaveAttribute("data-status", "received");
  // Inspection is the next step, and not theirs.
  await expect(page.getByTestId("return-waiting")).toHaveAttribute("data-step", "inspect");
});

test("the queue filters by status and order number, sorts on the server, and says when a number matches nothing", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/returns?status=refunded&sort=refund&dir=desc");
  const statuses = page.getByTestId("returns-table").getByTestId("return-row-status");
  await expect(statuses.first()).toBeVisible();
  for (const status of await statuses.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-status")))) expect(status).toBe("refunded");

  await page.goto("/returns?q=NO-SUCH-ORDER-000");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("مرتجعات العملاء");
  await expect(page.getByTestId("returns-order-missing")).toContainText("NO-SUCH-ORDER-000");
  await expect(page.getByTestId("returns-table").getByTestId("return-link")).toHaveCount(0);
});
