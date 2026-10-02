import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Order lifecycle v2 for the shopper (API 10.0), in a real browser against a
 * real backend: the price-change dialog at checkout, cancel-while-pending
 * versus a later cancellation request, and the store's reduced-quantity
 * proposal. Staff steps run through the API.
 *
 * Each test stocks a product of its own, so a price change or a shortage here
 * never touches the seeded catalogue the other live specs rely on.
 */

import {
  API,
  awaitQuota,
  bearer,
  customerToken,
  requireLiveApi,
  signIn,
  staffToken,
} from "./live-api";

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const SEEDED_ADDRESS = "10000000-0000-4000-8000-000000000001";

/** Inventory documents are dated by the Baghdad business day. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

interface Stocked {
  id: string;
  variant: string;
  sku: string;
}

async function staff(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const headers = bearer(await staffToken(request));
  const response = await request.fetch(`${API}${path}`, { method, headers, data });
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : null, text };
}

/** A fresh product with `quantity` on hand. */
async function stocked(request: APIRequestContext, key: string, quantity: number, price = 9000): Promise<Stocked> {
  const sku = `WLC-${run}-${key}`;
  const created = await staff(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Web lifecycle ${key} ${run}`,
    name_ar: `دورة الويب ${key} ${run}`,
    price,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, created.text).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await staff(request, "POST", "/admin/inventory/openings", {
    operation_id: `wlc-open-${run}-${key}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: LOCATION, quantity: String(quantity), unit_cost_iqd: "1000" }],
  });
  expect(opening.status, opening.text).toBe(201);
  return { id: created.body.id, variant, sku };
}

/** Leave only `quantity` of `item` in the seeded customer's cart. */
async function fillCart(request: APIRequestContext, item: Stocked, quantity: number) {
  const headers = bearer(await customerToken(request));
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: item.id, variant_id: item.variant, quantity } });
  expect(added.ok(), await added.text()).toBe(true);
}

async function order(request: APIRequestContext, item: Stocked, quantity: number) {
  await fillCart(request, item, quantity);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...bearer(await customerToken(request)), "Idempotency-Key": `wlc-${run}-${Math.random()}` },
    data: { address_id: SEEDED_ADDRESS, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as { id: string; order_number: string; version: number };
}

async function move(request: APIRequestContext, id: string, statuses: string[]) {
  for (const status of statuses) {
    const { version } = (await staff(request, "GET", `/admin/orders/${id}`)).body;
    const moved = await staff(request, "PATCH", `/admin/orders/${id}/status`, { status, version });
    expect(moved.status, `${status}: ${moved.text}`).toBe(200);
  }
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live lifecycle spec");
  await awaitQuota(request);
});

test("a price that changed after the cart is shown old → new and accepted at checkout", async ({ page, request }) => {
  const item = await stocked(request, "PRICE", 5);
  await fillCart(request, item, 2);
  const repriced = await staff(request, "PATCH", `/admin/products/${item.id}`, { price: 12000 });
  expect(repriced.status, repriced.text).toBe(200);

  await signIn(page, "/checkout");
  await expect(page.getByTestId("saved-addresses")).toBeVisible();
  await page.getByTestId("address-submit").click();
  await page.getByTestId("place-order").click();

  const dialog = page.locator('dialog[open][data-testid="price-change-dialog"]');
  await expect(dialog).toBeVisible();
  const line = dialog.getByTestId("price-change-line");
  await expect(line).toHaveCount(1);
  await expect(line).toHaveAttribute("data-direction", "up");
  await expect(line.getByTestId("price-change-old")).toContainText("9");
  await expect(line.getByTestId("price-change-new")).toContainText("12");
  // Nothing was ordered by the refused attempt.
  const before = await (await request.get(`${API}/orders?per_page=1`, { headers: bearer(await customerToken(request)) })).json();
  await dialog.getByTestId("price-change-accept").click();

  await expect(page.getByTestId("order-confirmation")).toBeVisible({ timeout: 30000 });
  const latest = await (await request.get(`${API}/orders?per_page=1`, { headers: bearer(await customerToken(request)) })).json();
  expect(latest.data[0].id).not.toBe(before.data[0]?.id);
  const placed = latest.data[0];
  expect(placed.items).toHaveLength(1);
  expect(Number(placed.items[0].unit_price)).toBe(12000);
  expect(Number(placed.items[0].quantity)).toBe(2);
});

test("back to cart orders nothing", async ({ page, request }) => {
  const item = await stocked(request, "BACK", 5);
  await fillCart(request, item, 1);
  expect((await staff(request, "PATCH", `/admin/products/${item.id}`, { price: 7000 })).status).toBe(200);
  const headers = bearer(await customerToken(request));
  const before = await (await request.get(`${API}/orders?per_page=1`, { headers })).json();

  await signIn(page, "/checkout");
  await page.getByTestId("address-submit").click();
  await page.getByTestId("place-order").click();
  const line = page.locator("dialog[open]").getByTestId("price-change-line");
  await expect(line).toHaveAttribute("data-direction", "down");
  await page.locator("dialog[open]").getByTestId("price-change-back").click();
  await expect(page).toHaveURL(/\/cart$/);

  const after = await (await request.get(`${API}/orders?per_page=1`, { headers })).json();
  expect(after.data[0]?.id).toBe(before.data[0]?.id);
});

test("a pending order cancels directly; a confirmed one only takes a request the store resolves", async ({ page, request }) => {
  const item = await stocked(request, "CXL", 5);
  const pending = await order(request, item, 1);
  const confirmed = await order(request, item, 1);
  await move(request, confirmed.id, ["confirmed"]);

  await signIn(page, `/account/orders/${pending.id}`);
  await expect(page.getByTestId("order-request-cancel")).toHaveCount(0);
  page.once("dialog", (prompt) => void prompt.accept());
  await page.getByTestId("order-cancel").click();
  const headers = bearer(await customerToken(request));
  await expect
    .poll(async () => (await (await request.get(`${API}/orders/${pending.id}`, { headers })).json()).status)
    .toBe("cancelled");
  await expect(page.getByTestId("order-cancel")).toHaveCount(0);

  await page.goto(`/account/orders/${confirmed.id}`);
  await expect(page.getByTestId("order-request-cancel")).toBeVisible();
  await expect(page.getByTestId("order-cancel")).toHaveCount(0);
  await page.getByTestId("order-request-cancel").click();
  await page.getByTestId("order-request-cancel-reason").fill("Ordered by mistake");
  await page.getByTestId("order-request-cancel-submit").click();
  const status = page.getByTestId("order-cancel-request-status");
  await expect(status).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("order-request-cancel")).toHaveCount(0);

  // The store denies it with a note; the shopper sees both and may ask again.
  const { version } = (await staff(request, "GET", `/admin/orders/${confirmed.id}`)).body;
  const denied = await staff(request, "POST", `/admin/orders/${confirmed.id}/cancellation-request/resolve`, {
    decision: "denied",
    reason: "Already packed",
    version,
  });
  expect(denied.status, denied.text).toBe(200);
  await page.reload();
  await expect(status).toHaveAttribute("data-status", "denied");
  await expect(status).toContainText("Already packed");
  await expect(page.getByTestId("order-request-cancel")).toBeVisible();
});

test("the shopper accepts the store's smaller quantity after a shortage", async ({ page, request }) => {
  const item = await stocked(request, "SHORT", 3);
  const placed = await order(request, item, 3);
  // Count the lot down to one: the order now needs attention.
  const count = (await staff(request, "POST", "/admin/inventory/counts", { variant_id: item.variant, reason: "Web live shortage" })).body;
  const approved = await staff(request, "POST", `/admin/inventory/counts/${count.id}/approve`, {
    operation_id: `wlc-count-${run}`,
    document_date: today(),
    lines: count.lines.map((line: { batch_id: string; location_id: string }) => ({
      batch_id: line.batch_id,
      location_id: line.location_id,
      counted_quantity: "1",
    })),
  });
  expect(approved.status, approved.text).toBe(201);
  await move(request, placed.id, ["confirmed", "preparing"]);

  const detail = (await staff(request, "GET", `/admin/orders/${placed.id}`)).body;
  const short = detail.attention_details.short_lines[0];
  const proposed = await staff(request, "POST", `/admin/orders/${placed.id}/shortage-resolution`, {
    action: "reduce",
    order_item_id: short.order_item_id,
    new_quantity: 1,
    reason: "Only one left",
    version: detail.version,
  });
  expect(proposed.status, proposed.text).toBe(200);

  await signIn(page, `/account/orders/${placed.id}`);
  const prompt = page.getByTestId("order-reduction");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Only one left");
  await prompt.getByTestId("order-reduction-accept").click();
  await expect(prompt).toHaveCount(0);

  const mine = await (await request.get(`${API}/orders/${placed.id}`, { headers: bearer(await customerToken(request)) })).json();
  expect(mine.attention_details?.reduction_proposal?.status).toBe("accepted");
  expect(Number(mine.items[0].quantity)).toBe(1);
});
