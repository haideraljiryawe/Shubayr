import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  API,
  adminApiToken,
  awaitHeadroom,
  bearer,
  CUSTOMER_PHONE,
  phoneToken,
  randomWorkPhone,
  requireLiveApi,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Cash collected on delivery (contract 12.0) in the Web Admin, against a
 * real API: staff deliver on an external driver's behalf with the amount
 * collected (the shortfall said before confirming), a double click posts
 * once, and an unconfirmed collection is confirmed later in full or short
 * from the queue.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const money = (value: number) => new Intl.NumberFormat("en-US").format(value);

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

let stockedItem: { id: string; variant: string } | null = null;

/** One product with stock for every order of this run. */
async function item(request: APIRequestContext) {
  if (stockedItem) return stockedItem;
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Cash ${run}`,
    name_ar: `نقد ${run}`,
    price: 25000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku: `CASH-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `cash-open-${run}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: LOCATION, quantity: "20", unit_cost_iqd: "10000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  stockedItem = { id: created.body.id as string, variant };
  return stockedItem;
}

/** A COD order dispatched to `partyId`, with its total. */
async function dispatched(request: APIRequestContext, partyId: string) {
  const product = await item(request);
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  const addressId = (addresses.data ?? addresses)[0].id as string;
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: product.id, variant_id: product.variant, quantity: 1 } });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `cash-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const order = (await placed.json()) as { id: string; order_number: string; delivery_id: string; total: number };
  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
    expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status, version: body.version })).status).toBe(200);
  }
  expect((await api(request, "PATCH", `/deliveries/${order.delivery_id}/assign`, { party_id: partyId })).status).toBe(200);
  const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
  expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status: "dispatched", version: body.version })).status).toBe(200);
  return order;
}

async function createDriver(request: APIRequestContext) {
  const created = await api(request, "POST", "/admin/external-drivers", { name: `Cash driver ${run}`, phone: randomWorkPhone() });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.id as string;
}

async function cashHeld(request: APIRequestContext, partyId: string): Promise<number> {
  return (await api(request, "GET", `/admin/delivery-parties/${partyId}/custody`)).body.cash.amount as number;
}

/** Open the order's deliver step. */
async function openDeliver(page: Page, orderId: string) {
  await page.goto(`/orders/${orderId}`);
  await page.getByTestId("order-action-deliver").click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.getByTestId("collection-fields")).toBeVisible();
  return dialog;
}

let driverId = "";

test("staff deliver for an external driver: the amount is pre-filled, a shortfall is said before confirming, and only the cash collected is in the driver's custody", async ({ page, request }) => {
  driverId = await createDriver(request);
  const order = await dispatched(request, driverId);
  const before = await cashHeld(request, driverId);
  await uiLoginAsAdmin(page);
  const dialog = await openDeliver(page, order.id);
  await expect(dialog.getByTestId("collection-due")).toContainText(money(order.total));
  await expect(dialog.getByTestId("collection-amount")).toHaveValue(String(order.total));
  await expect(dialog.getByTestId("collection-preview")).toHaveAttribute("data-state", "full");
  const collected = order.total - 5000;
  await dialog.getByTestId("collection-amount").fill(String(collected));
  await expect(dialog.getByTestId("collection-preview")).toHaveAttribute("data-state", "short");
  await expect(dialog.getByTestId("collection-preview")).toContainText(money(5000));
  await dialog.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "delivered");
  const recorded = page.getByTestId("order-collection");
  await expect(recorded.getByTestId("collection-summary")).toHaveAttribute("data-status", "confirmed_short");
  await expect(recorded.getByTestId("collection-shortfall")).toContainText(money(5000));
  expect(await cashHeld(request, driverId)).toBe(before + collected);
  // The party page shows the cash now held.
  await page.goto(`/delivery-parties/${driverId}`);
  await expect(page.getByTestId("custody-cash-amount")).toContainText(money(before + collected));
});

test("a double click on deliver posts once", async ({ page, request }) => {
  const order = await dispatched(request, driverId);
  const before = await cashHeld(request, driverId);
  await uiLoginAsAdmin(page);
  const posts: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "PATCH" && sent.url().includes(`/admin/deliveries/${order.delivery_id}/status`)) posts.push(sent.postData() ?? "");
  });
  const dialog = await openDeliver(page, order.id);
  await dialog.getByTestId("confirm-submit").dblclick();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "delivered");
  await expect(page.getByTestId("order-collection").getByTestId("collection-summary")).toHaveAttribute("data-status", "confirmed_full");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0])).toMatchObject({ status: "delivered", collection_confirmation: "confirmed", collected_amount: String(order.total), source: "web_admin" });
  expect(await cashHeld(request, driverId)).toBe(before + order.total);
});

test("an unconfirmed delivery is confirmed later from the queue, in full and short", async ({ page, request }) => {
  test.setTimeout(180_000);
  await awaitHeadroom(request, 60);
  const full = await dispatched(request, driverId);
  const short = await dispatched(request, driverId);
  await uiLoginAsAdmin(page);
  // Delivered with the amount not confirmed yet: no cash counted.
  const cashBefore = await cashHeld(request, driverId);
  for (const order of [full, short]) {
    const dialog = await openDeliver(page, order.id);
    await dialog.getByTestId("collection-unconfirmed").check();
    await expect(dialog.getByTestId("collection-preview")).toHaveAttribute("data-state", "unconfirmed");
    await dialog.getByTestId("confirm-submit").click();
    await expect(page.getByTestId("order-collection").getByTestId("collection-summary")).toHaveAttribute("data-status", "unconfirmed");
  }
  expect(await cashHeld(request, driverId)).toBe(cashBefore);

  // The queue lists both (oldest first: they are on its last page).
  const { body } = await api(request, "GET", "/admin/deliveries/unconfirmed?per_page=100");
  const last = Math.max(1, Math.ceil(body.total / 100));
  const queue = `/deliveries/unconfirmed?per_page=100&page=${last}`;
  await page.goto("/orders");
  await page.getByTestId("orders-tab-collections").click();
  await expect(page).toHaveURL(/\/deliveries\/unconfirmed$/);
  await page.goto(queue);
  const row = (number: string) => page.locator('[data-testid="table-row"]', { has: page.locator(`[data-testid="unconfirmed-order"]`, { hasText: number }) });
  await expect(row(full.order_number)).toHaveCount(1);
  await expect(row(short.order_number)).toHaveCount(1);

  // Later full: the amount due, as pre-filled.
  await row(full.order_number).getByTestId("unconfirmed-confirm").click();
  let dialog = page.locator("dialog[open]");
  await expect(dialog.getByTestId("collection-amount")).toHaveValue(String(full.total));
  await expect(dialog.getByTestId("collection-unconfirmed")).toHaveCount(0);
  await dialog.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("unconfirmed-done")).toHaveAttribute("data-status", "confirmed_full");
  await expect(row(full.order_number)).toHaveCount(0);

  // Later short: the shortfall is said before confirming.
  await row(short.order_number).getByTestId("unconfirmed-confirm").click();
  dialog = page.locator("dialog[open]");
  await dialog.getByTestId("collection-amount").fill(String(short.total - 2500));
  await expect(dialog.getByTestId("collection-preview")).toHaveAttribute("data-state", "short");
  await expect(dialog.getByTestId("collection-preview")).toContainText(money(2500));
  await dialog.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("unconfirmed-done")).toHaveAttribute("data-status", "confirmed_short");
  await expect(page.getByTestId("unconfirmed-done").getByTestId("collection-shortfall")).toContainText(money(2500));
  await expect(row(short.order_number)).toHaveCount(0);
  expect(await cashHeld(request, driverId)).toBe(cashBefore + full.total + short.total - 2500);
});
