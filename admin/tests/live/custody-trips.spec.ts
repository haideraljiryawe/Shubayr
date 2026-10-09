import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  API,
  activateStaff,
  adminApiToken,
  bearer,
  CUSTOMER_PHONE,
  createStaff,
  phoneToken,
  randomWorkPhone,
  requireLiveApi,
  switchUser,
  uiLogin,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Custody exceptions (13.3) and external-driver trips (13.4) in the Web
 * Admin, against a real API: a customer-paid trip with three orders —
 * delivered, returned at the door, failed then lost — closed with a cash
 * difference by a second user after the creator and an unresolved order are
 * refused; a store-borne loss, a capped fee refund, one document per double
 * click, reversal never by its recorder; a driver found beyond the first
 * hundred parties; and no action without its permission.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const digits = (text: string | null) => (text ?? "").replace(/[^\d-]/g, "");

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH" | "PUT", path: string, data?: unknown, headers: Record<string, string> = {}) {
  const response = await request.fetch(`${API}${path}`, { method, headers: { ...bearer(await adminApiToken(request)), ...headers }, data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

let stocked: { id: string; variant: string } | null = null;

async function item(request: APIRequestContext) {
  if (stocked) return stocked;
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Custody ${run}`,
    name_ar: `عهدة ${run}`,
    price: 25000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku: `CUST-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `cust-open-${run}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: LOCATION, quantity: "40", unit_cost_iqd: "10000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  stocked = { id: created.body.id as string, variant };
  return stocked;
}

interface Ready {
  id: string;
  order_number: string;
  total: number;
  delivery_id: string;
}

/** A COD order ready for dispatch (quantity pieces). */
async function ready(request: APIRequestContext, quantity = 1): Promise<Ready> {
  const product = await item(request);
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  const addressId = (addresses.data ?? addresses)[0].id as string;
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: product.id, variant_id: product.variant, quantity } });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `cust-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const order = (await placed.json()) as Ready;
  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
    expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status, version: body.version })).status).toBe(200);
  }
  return order;
}

/** Ready, then assigned to `partyId` and dispatched (goods in their custody). */
async function dispatched(request: APIRequestContext, partyId: string): Promise<Ready> {
  const order = await ready(request);
  expect((await api(request, "PATCH", `/deliveries/${order.delivery_id}/assign`, { party_id: partyId })).status).toBe(200);
  const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
  expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status: "dispatched", version: body.version })).status).toBe(200);
  return order;
}

async function deliverFull(request: APIRequestContext, order: Ready) {
  const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
  const done = await api(request, "PATCH", `/admin/deliveries/${order.delivery_id}/status`, {
    status: "delivered",
    order_version: body.version,
    operation_id: `cust-dlv-${run}-${Math.random()}`,
    collection_confirmation: "confirmed",
    collected_amount: String(order.total),
    source: "web_admin",
  });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

/** Store delivery fee for orders placed while `run` runs; restored after. */
async function withDeliveryFee<T>(request: APIRequestContext, fee: string, run: () => Promise<T>): Promise<T> {
  const before = (await api(request, "GET", "/admin/settings")).body.settings.delivery_fee as string;
  expect((await api(request, "PUT", "/admin/settings", { settings: { delivery_fee: fee } })).status).toBe(200);
  try {
    return await run();
  } finally {
    await api(request, "PUT", "/admin/settings", { settings: { delivery_fee: before } });
  }
}

async function createDriver(request: APIRequestContext, name: string) {
  const created = await api(request, "POST", "/admin/external-drivers", { name, phone: randomWorkPhone() });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return { id: created.body.id as string, name: created.body.name as string };
}

let accountId = "";
async function till(request: APIRequestContext): Promise<string> {
  if (accountId) return accountId;
  const created = await api(request, "POST", "/admin/cash-accounts", { name: `Till ${run}`, kind: "cash", currency_code: "IQD" });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  accountId = created.body.id as string;
  return accountId;
}

async function cashHeld(request: APIRequestContext, partyId: string): Promise<number> {
  return (await api(request, "GET", `/admin/delivery-parties/${partyId}/custody`)).body.cash.amount as number;
}

async function exceptionsOf(request: APIRequestContext, orderId: string) {
  return (await api(request, "GET", `/admin/custody-exceptions?order_id=${orderId}&per_page=100`)).body as { total: number; data: Array<{ id: string; type: string; status: string; liability_bearer: string | null; amount_iqd: number }> };
}

/** Choose a party in a search picker by typing part of its name. */
async function pickParty(page: Page, testId: string, name: string, id: string) {
  await page.getByTestId(`${testId}-input`).fill(name);
  await page.locator(`[data-testid="${testId}-option"][data-party="${id}"]`).click();
  await expect(page.getByTestId(testId)).toHaveAttribute("data-party", id);
}

let cashier: { username: string; password: string } | null = null;
async function cashierUser(request: APIRequestContext) {
  cashier ??= await activateStaff(request, await createStaff(request, { presets: ["cashier"], prefix: "tripcash" }));
  return cashier;
}

let tripId = "";
let partyLossId = "";
let storeLossId = "";

test("a customer-paid trip with three orders: handover, outcomes, the settlement before closing, and a close with a cash difference by a second user", async ({ page, request }) => {
  test.setTimeout(420_000);
  const account = await till(request);
  const second = await cashierUser(request);
  // A customer-paid fare needs orders with no store delivery fee.
  const orders = await withDeliveryFee(request, "0", async () => [await ready(request), await ready(request, 2), await ready(request)]);
  const driver = await createDriver(request, `Trip driver ${run}`);
  await uiLoginAsAdmin(page);

  // The trip: the driver found by search, a customer-paid fare of 6,000.
  await page.goto("/deliveries/trips/new");
  await pickParty(page, "trip-driver", driver.name, driver.id);
  await page.getByTestId("trip-bearer-customer_direct").check();
  await expect(page.getByTestId("trip-method")).toHaveValue("customer_direct");
  await page.getByTestId("trip-fare").fill("6000");
  await page.getByTestId("trip-submit").click();
  await expect(page.getByTestId("trip-view")).toHaveAttribute("data-status", "open");
  tripId = new URL(page.url()).pathname.split("/").at(-1)!;

  // Hand over the three orders, 2,000 of the fare each, with the customer's acceptance.
  await page.getByTestId("trip-add-share").fill("2000");
  await page.getByTestId("trip-add-note").fill("Customer agreed to pay the driver on the phone");
  for (const order of orders) {
    await page.getByTestId("trip-add-search").fill(order.order_number);
    await page.locator(`[data-testid="trip-add-row"][data-order="${order.order_number}"]`).getByTestId("trip-add-order").click();
    await expect(page.locator(`[data-testid="trip-order"][data-order="${order.order_number}"]`)).toHaveCount(1);
  }
  await expect(page.getByTestId("trip-shares")).toHaveAttribute("data-left", "0");
  await page.getByTestId("trip-start-button").click();
  await expect(page.getByTestId("trip-view")).toHaveAttribute("data-status", "in_progress");
  const row = (order: Ready) => page.locator(`[data-testid="trip-order"][data-order="${order.order_number}"]`);

  // 1: delivered in full.
  await row(orders[0]).getByTestId("trip-order-deliver").click();
  await expect(page.getByTestId("collection-amount")).toHaveValue(String(orders[0].total));
  await page.getByTestId("trip-deliver-confirm").click();
  await expect(row(orders[0]).getByTestId("trip-order-delivery")).toHaveAttribute("data-status", "delivered");

  // 2 (two pieces): one refused at the door — delivered with what was paid, the other back in stock.
  await row(orders[1]).getByTestId("trip-order-return").click();
  await expect(page.getByTestId("exception-return")).toBeVisible();
  await page.getByTestId("exception-quantity").first().fill("1");
  await expect(page.getByTestId("exception-collected")).toHaveValue(String(orders[1].total / 2));
  await page.getByTestId("exception-location").selectOption(LOCATION);
  await page.getByTestId("exception-reason").fill("Customer refused one piece at the door");
  await page.getByTestId("exception-submit").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  const [returned] = (await exceptionsOf(request, orders[1].id)).data;
  expect(returned).toMatchObject({ type: "return_against_uncollected", status: "active", amount_iqd: orders[1].total / 2 });
  // The party is no longer expected to bring the refused half: nothing is left uncollected.
  await page.goto(`/delivery-parties/${driver.id}?tab=collections`);
  const collection = page.getByTestId("party-collections-table").getByTestId("table-row").filter({ hasText: orders[1].order_number });
  await expect(collection.getByTestId("party-collection-uncollected")).toHaveText(/0/);
  expect(digits(await collection.getByTestId("party-collection-uncollected").textContent())).toBe("0");

  // 3: failed.
  await page.goto(`/deliveries/trips/${tripId}`);
  await row(orders[2]).getByTestId("trip-order-fail").click();
  await page.getByTestId("trip-fail-reason").fill("Nobody at home");
  await page.getByTestId("trip-fail-confirm").click();
  await expect(row(orders[2]).getByTestId("trip-order-delivery")).toHaveAttribute("data-status", "failed");
  await expect(row(orders[2])).toHaveAttribute("data-blocker", "notDelivered");

  // The creator can't close it (separation of duties)…
  await page.getByTestId("trip-close-button").click();
  await page.getByTestId("trip-close-confirm").click();
  await expect(page.getByTestId("trip-refusal")).toHaveAttribute("data-kind", "ownTrip");
  // …and a second user is refused while order 3 is unresolved, with it named.
  await switchUser(page, second.username, second.password);
  await page.goto(`/deliveries/trips/${tripId}`);
  await expect(page.locator(`[data-testid="trip-close-blocker"][data-order="${orders[2].order_number}"]`)).toHaveCount(1);
  await page.getByTestId("trip-close-button").click();
  await page.getByTestId("trip-close-confirm").click();
  await expect(page.getByTestId("trip-refusal")).toHaveAttribute("data-kind", "unresolved");
  await expect(page.locator(`[data-testid="trip-blocking-order"][data-order="${orders[2].order_number}"]`)).toHaveCount(1);
  await expect(page.getByTestId("trip-view")).toHaveAttribute("data-status", "in_progress");

  // Order 3's parcel is lost; the driver bears it (it adds to the cash they owe).
  await switchUser(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  const heldBefore = await cashHeld(request, driver.id);
  await page.goto(`/deliveries/trips/${tripId}`);
  await row(orders[2]).getByTestId("trip-order-lost").click();
  await expect(page.getByTestId("exception-loss")).toBeVisible();
  await page.getByTestId("exception-bearer-party").check();
  await page.getByTestId("exception-reason").fill("Parcel lost by the driver");
  await page.getByTestId("exception-submit").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  const [lost] = (await exceptionsOf(request, orders[2].id)).data;
  partyLossId = lost.id;
  expect(lost).toMatchObject({ type: "goods_loss", liability_bearer: "party" });
  expect(await cashHeld(request, driver.id)).toBe(heldBefore + lost.amount_iqd);

  // Part of the cash handed in, from the trip (the receive screen pre-filled for the driver).
  await page.goto(`/deliveries/trips/${tripId}`);
  const expected = orders[0].total + orders[1].total / 2;
  expect(digits(await page.getByTestId("trip-expected").textContent())).toBe(String(expected));
  await page.getByTestId("trip-receive-cash").click();
  await expect(page.getByTestId("receive-party")).toHaveAttribute("data-party", driver.id);
  await expect(page.getByTestId("receive-amount")).toHaveValue(String(expected));
  await page.getByTestId("receive-amount").fill(String(expected - 10000));
  await page.getByTestId("receive-cash-account").selectOption(account);
  await page.getByTestId("allocation-auto").click();
  await page.getByTestId("receive-review-button").click();
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();

  // The second user closes it: the 10,000 difference is shown before confirming.
  await switchUser(page, second.username, second.password);
  await page.goto(`/deliveries/trips/${tripId}`);
  await expect(page.getByTestId("trip-close-blocked")).toHaveCount(0);
  await page.getByTestId("trip-close-button").click();
  await expect(page.getByTestId("trip-close-preview")).toHaveAttribute("data-outstanding", "10000");
  await expect(page.getByTestId("trip-close-preview")).toHaveAttribute("data-result", "settlement_open");
  await page.getByTestId("trip-close-confirm").click();
  await expect(page.getByTestId("trip-view")).toHaveAttribute("data-status", "closed");
  await expect(page.getByTestId("trip-result")).toHaveAttribute("data-result", "settlement_open");
  const closed = (await api(request, "GET", `/admin/external-driver-trips/${tripId}`)).body as { settlement: Record<string, number>; fare: { bearer: string } };
  expect(closed.settlement).toMatchObject({ expected_cash_iqd: expected, received_cash_iqd: expected - 10000, netted_fare_iqd: 0, outstanding_cash_iqd: 10000 });
  expect(closed.fare.bearer).toBe("customer_direct");
  // The party page lists the trip, closed.
  await page.goto(`/delivery-parties/${driver.id}`);
  await expect(page.locator('[data-testid="party-trip"][data-status="closed"]')).toHaveCount(1);
});

test("a store-borne loss, a fee refund capped at the fee, and a reversal never by its recorder", async ({ page, request }) => {
  test.setTimeout(300_000);
  const account = await till(request);
  const second = await cashierUser(request);
  const driver = await createDriver(request, `Loss driver ${run}`);
  const lostOrder = await dispatched(request, driver.id);
  const refunded = await dispatched(request, driver.id);
  await deliverFull(request, refunded);
  await uiLoginAsAdmin(page);

  // Lost, borne by the store: no cash added to the driver.
  const heldBefore = await cashHeld(request, driver.id);
  await page.goto(`/orders/${lostOrder.id}`);
  await page.getByTestId("order-exception-goods_loss").click();
  await page.getByTestId("exception-submit").click();
  // Who bears it must be chosen first.
  await expect(page.getByTestId("exception-bearer-error")).toBeVisible();
  await page.getByTestId("exception-bearer-store").check();
  await page.getByTestId("exception-reason").fill("Box crushed in transit");
  await page.getByTestId("exception-submit").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  const [loss] = (await exceptionsOf(request, lostOrder.id)).data;
  storeLossId = loss.id;
  expect(loss).toMatchObject({ type: "goods_loss", liability_bearer: "store" });
  expect(await cashHeld(request, driver.id)).toBe(heldBefore);

  // The fee refund is capped at the 5,000 charged.
  await page.goto(`/finance/custody-exceptions/new?order_id=${refunded.id}&type=delivery_fee_refund`);
  await expect(page.getByTestId("exception-refund-cap")).toHaveAttribute("data-cap", "5000");
  await page.getByTestId("exception-amount").fill("6000");
  await page.getByTestId("exception-cash-account").selectOption(account);
  await page.getByTestId("exception-reason").fill("Delivered late");
  await page.getByTestId("exception-submit").click();
  await expect(page.getByTestId("exception-problems")).toBeVisible();
  expect((await exceptionsOf(request, refunded.id)).total).toBe(0);
  await page.getByTestId("exception-amount").fill("3000");
  await page.getByTestId("exception-submit").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  // Again: 2,000 is left; meanwhile 2,000 more is refunded elsewhere, so the API refuses.
  await page.goto(`/finance/custody-exceptions/new?order_id=${refunded.id}&type=delivery_fee_refund`);
  await expect(page.getByTestId("exception-refund-cap")).toHaveAttribute("data-cap", "2000");
  const elsewhere = await api(request, "POST", "/admin/custody-exceptions/delivery-fee-refund", {
    operation_id: `cust-refund-${run}-${Math.random()}`,
    document_date: today(),
    order_id: refunded.id,
    amount_iqd: "2000",
    settlement_method: "cash_account",
    cash_account_id: account,
    reason: "Refunded at the counter",
  });
  expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(201);
  await page.getByTestId("exception-amount").fill("2000");
  await page.getByTestId("exception-cash-account").selectOption(account);
  await page.getByTestId("exception-reason").fill("Delivered late");
  await page.getByTestId("exception-submit").click();
  await expect(page.getByTestId("exception-refusal")).toHaveAttribute("data-kind", "feeCap");
  expect((await exceptionsOf(request, refunded.id)).data.filter((row) => row.status === "active").reduce((sum, row) => sum + row.amount_iqd, 0)).toBe(5000);

  // Reversal: refused to its recorder, done by a second user.
  await page.goto(`/finance/custody-exceptions/${storeLossId}`);
  await page.getByTestId("exception-reverse").click();
  await page.getByTestId("exception-reverse-reason").fill("Box found intact");
  await page.getByTestId("exception-reverse-confirm").click();
  await expect(page.getByTestId("exception-refusal")).toHaveAttribute("data-kind", "ownException");
  await expect(page.getByTestId("exception-status")).toHaveAttribute("data-status", "active");
  // A party-borne loss says up front that a receipt must be reversed first.
  await page.goto(`/finance/custody-exceptions/${partyLossId}`);
  await expect(page.getByTestId("exception-receipt-rule")).toBeVisible();
  await switchUser(page, second.username, second.password);
  await page.goto(`/finance/custody-exceptions/${storeLossId}`);
  await page.getByTestId("exception-reverse").click();
  await page.getByTestId("exception-reverse-reason").fill("Box found intact");
  await page.getByTestId("exception-reverse-confirm").click();
  await expect(page.getByTestId("exception-notice")).toBeVisible();
  await expect(page.getByTestId("exception-status")).toHaveAttribute("data-status", "reversed");
  await expect(page.getByTestId("exception-reversal-reason")).toHaveText("Box found intact");
});

test("a double click records one custody exception", async ({ page, request }) => {
  const driver = await createDriver(request, `Twice driver ${run}`);
  const order = await dispatched(request, driver.id);
  await uiLoginAsAdmin(page);
  const posts: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && new URL(sent.url()).pathname.endsWith("/custody-exceptions/goods-loss")) posts.push(sent.postData() ?? "");
  });
  await page.goto(`/finance/custody-exceptions/new?order_id=${order.id}&type=goods_loss`);
  await page.getByTestId("exception-bearer-store").check();
  await page.getByTestId("exception-reason").fill("Dropped twice");
  await page.getByTestId("exception-submit").dblclick();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  expect(new Set(posts.map((body) => (JSON.parse(body) as { operation_id: string }).operation_id)).size).toBe(1);
  expect((await exceptionsOf(request, order.id)).total).toBe(1);
});

test("a driver is found by search beyond the first hundred parties", async ({ page, request }) => {
  test.setTimeout(240_000);
  // More than 100 parties, and one whose name sorts after all of them.
  let { body } = await api(request, "GET", "/admin/delivery-parties?per_page=1");
  for (let index = body.total as number; index <= 101; index += 1) {
    const created = await api(request, "POST", "/admin/external-drivers", { name: `Bulk ${run} ${String(index).padStart(3, "0")}`, phone: randomWorkPhone() }, { "X-Forwarded-For": `198.19.${(index % 250) + 1}.${(index % 200) + 1}` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
  }
  const far = await createDriver(request, `ZZZ Far ${run}`);
  ({ body } = await api(request, "GET", "/admin/delivery-parties?per_page=100"));
  expect(body.total).toBeGreaterThan(100);
  expect((body.data as Array<{ id: string }>).some((party) => party.id === far.id)).toBe(false);

  await uiLoginAsAdmin(page);
  await page.goto("/deliveries/trips");
  await pickParty(page, "filter-driver_party_id", `ZZZ Far ${run}`, far.id);
  await expect(page).toHaveURL(new RegExp(`driver_party_id=${far.id}`));
  await expect(page.getByTestId("filter-driver_party_id-chosen")).toContainText(`ZZZ Far ${run}`);
  // The same search on the receive screen.
  await page.goto("/finance/cash-receipts/new");
  await page.getByTestId("receive-party-input").fill(`ZZZ Far ${run}`);
  await expect(page.locator(`[data-testid="receive-party-option"][data-party="${far.id}"]`)).toHaveCount(1);
});

test("without the permissions, no trip or exception action is offered", async ({ page, request }) => {
  const viewer = await activateStaff(request, await createStaff(request, { permissionKeys: ["trips.view", "custody_exceptions.view", "orders.view"], prefix: "tripview" }));
  await uiLogin(page, viewer.username, viewer.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await page.goto("/deliveries/trips");
  await expect(page.getByTestId("trips-table")).toBeVisible();
  await expect(page.getByTestId("trips-new")).toHaveCount(0);
  await page.goto(`/deliveries/trips/${tripId}`);
  await expect(page.getByTestId("trip-view")).toBeVisible();
  for (const id of ["trip-add", "trip-start", "trip-close", "trip-receive-cash", "trip-order-deliver", "trip-order-fail", "trip-order-return", "trip-order-lost", "trip-order-refund"]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await page.goto(`/finance/custody-exceptions/${partyLossId}`);
  await expect(page.getByTestId("exception-view")).toBeVisible();
  await expect(page.getByTestId("exception-reverse")).toHaveCount(0);
  await page.goto("/finance/custody-exceptions");
  await expect(page.getByTestId("exceptions-table")).toBeVisible();
  const { body } = await api(request, "GET", `/admin/custody-exceptions/${partyLossId}`);
  await page.goto(`/orders/${body.order_id}`);
  await expect(page.getByTestId("order-exceptions-list")).toBeVisible();
  await expect(page.locator('[data-testid^="order-exception-"]')).toHaveCount(0);
  await page.goto(`/finance/custody-exceptions/new?order_id=${body.order_id}`);
  await expect(page.getByTestId("exception-form")).toHaveCount(0);
});
