import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
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
 * Cash receipts from delivery parties (contract 13.2, phase 8c) in the Web
 * Admin, against a real API: receive a party's cash and allocate it to their
 * orders (oldest first or by hand, the rest unallocated), allocate a
 * remainder later, every refusal in words, one voucher per double click,
 * reversal by a second user (never the one who posted it), and the party
 * page and custody overview read again after each.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
/** Digits only: amounts are compared whatever the locale's grouping. */
const digits = (text: string | null) => (text ?? "").replace(/[^\d]/g, "");

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
    name_en: `Receipt ${run}`,
    name_ar: `إيصال ${run}`,
    price: 25000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku: `RCPT-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `rcpt-open-${run}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: LOCATION, quantity: "40", unit_cost_iqd: "10000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  stockedItem = { id: created.body.id as string, variant };
  return stockedItem;
}

interface Delivered {
  id: string;
  order_number: string;
  total: number;
}

/** A COD order delivered by `partyId`, its whole total collected and confirmed. */
async function delivered(request: APIRequestContext, partyId: string): Promise<Delivered> {
  const product = await item(request);
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  const addressId = (addresses.data ?? addresses)[0].id as string;
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: product.id, variant_id: product.variant, quantity: 1 } });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `rcpt-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const order = (await placed.json()) as Delivered & { delivery_id: string };
  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const { body } = await api(request, "GET", `/admin/orders/${order.id}`);
    expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status, version: body.version })).status).toBe(200);
  }
  expect((await api(request, "PATCH", `/deliveries/${order.delivery_id}/assign`, { party_id: partyId })).status).toBe(200);
  let { body } = await api(request, "GET", `/admin/orders/${order.id}`);
  expect((await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status: "dispatched", version: body.version })).status).toBe(200);
  ({ body } = await api(request, "GET", `/admin/orders/${order.id}`));
  const done = await api(request, "PATCH", `/admin/deliveries/${order.delivery_id}/status`, {
    status: "delivered",
    order_version: body.version,
    operation_id: `rcpt-dlv-${run}-${Math.random()}`,
    collection_confirmation: "confirmed",
    collected_amount: String(order.total),
    source: "web_admin",
  });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  return { id: order.id, order_number: order.order_number, total: order.total };
}

async function createDriver(request: APIRequestContext, label: string) {
  const created = await api(request, "POST", "/admin/external-drivers", { name: `Cash ${label} ${run}`, phone: randomWorkPhone() });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return { id: created.body.id as string, name: created.body.name as string };
}

let accountId = "";

/** This run's IQD till; the seed has no cash account. */
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

async function receiptsOf(request: APIRequestContext, partyId: string) {
  return (await api(request, "GET", `/admin/cash-receipts?party_id=${partyId}&per_page=100`)).body as { total: number; data: Array<Record<string, unknown>> };
}

/** A receipt posted straight through the API, as another screen or user would. */
async function apiReceipt(request: APIRequestContext, partyId: string, amount: number, allocations: Array<{ order_id: string; amount_iqd: string }> = []) {
  const posted = await api(request, "POST", "/admin/cash-receipts", {
    operation_id: `op-rcpt-api-${run}-${Math.random()}`,
    document_date: today(),
    party_id: partyId,
    cash_account_id: await till(request),
    amount_iqd: String(amount),
    allocations,
  });
  expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  return posted.body as { id: string; document_number: string };
}

/** The receive screen for a party, with this run's till chosen. */
async function openReceive(page: Page, request: APIRequestContext, partyId: string) {
  const account = await till(request);
  await page.goto(`/finance/cash-receipts/new?party_id=${partyId}`);
  await expect(page.getByTestId("receive-form")).toBeVisible();
  await page.getByTestId("receive-cash-account").selectOption(account);
}

let driverA = { id: "", name: "" };
let firstReceipt = "";
/** One of driver A's orders, for the wrong-party refusal. */
let firstReceiptOrder = "";

test("receive cash and auto-allocate across 3 orders with a remainder, then allocate the remainder later; the party and the custody overview follow", async ({ page, request }) => {
  test.setTimeout(240_000);
  driverA = await createDriver(request, "A");
  const orders = [await delivered(request, driverA.id), await delivered(request, driverA.id), await delivered(request, driverA.id)];
  firstReceiptOrder = orders[0].id;
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  expect(await cashHeld(request, driverA.id)).toBe(total);
  const account = await till(request);
  await uiLoginAsAdmin(page);

  // The custody overview shows what the party holds.
  await page.goto(`/delivery-parties/custody?q=${encodeURIComponent(driverA.name)}`);
  const overviewRow = page.getByTestId("custody-overview").getByTestId("table-row").filter({ hasText: driverA.name });
  await expect(overviewRow.getByTestId("custody-cash-held")).toHaveText(/./);
  expect(digits(await overviewRow.getByTestId("custody-cash-held").textContent())).toBe(String(total));

  // From the party's page to receiving its cash.
  await page.goto(`/delivery-parties/${driverA.id}`);
  await page.getByTestId("party-receive").click();
  await expect(page).toHaveURL(new RegExp(`/finance/cash-receipts/new\\?party_id=${driverA.id}`));
  await expect(page.getByTestId("receive-party")).toHaveAttribute("data-party", driverA.id);
  expect(digits(await page.getByTestId("receive-cash-held").textContent())).toBe(String(total));
  // Its unsettled collections, oldest first.
  const rows = page.getByTestId("allocation-row");
  await expect(rows).toHaveCount(3);
  for (const [index, order] of orders.entries()) await expect(rows.nth(index)).toHaveAttribute("data-order", order.order_number);

  await page.getByTestId("receive-cash-account").selectOption(account);
  await page.getByTestId("receive-all-held").click();
  await expect(page.getByTestId("receive-amount")).toHaveValue(String(total));
  await page.getByTestId("allocation-auto").click();
  const amounts = page.getByTestId("allocation-amount");
  for (const [index, order] of orders.entries()) await expect(amounts.nth(index)).toHaveValue(String(order.total));
  expect(digits(await page.getByTestId("allocation-unallocated").textContent())).toBe("0");
  // Keep 5,000 back from the newest order: it shows as unallocated, live.
  await amounts.nth(2).fill(String(orders[2].total - 5000));
  await expect(page.getByTestId("allocation-unallocated")).toHaveText(/5/);
  expect(digits(await page.getByTestId("allocation-unallocated").textContent())).toBe("5000");

  await page.getByTestId("receive-review-button").click();
  await expect(page.getByTestId("receive-review")).toBeVisible();
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  // Read again without a reload: the party holds nothing now.
  await expect.poll(async () => digits(await page.getByTestId("receive-cash-held").textContent())).toBe("0");
  const receipt = (await receiptsOf(request, driverA.id)).data[0] as { id: string; allocated_amount_iqd: number; unallocated_amount_iqd: number };
  firstReceipt = receipt.id;
  expect(receipt).toMatchObject({ allocated_amount_iqd: total - 5000, unallocated_amount_iqd: 5000 });
  expect(await cashHeld(request, driverA.id)).toBe(0);

  // The party page and the overview follow.
  await page.goto(`/delivery-parties/${driverA.id}`);
  expect(digits(await page.getByTestId("custody-cash-amount").textContent())).toBe("0");
  await expect(page.locator('[data-testid="cash-activity"][data-event="cash_received"]')).toHaveCount(1);
  await page.goto(`/delivery-parties/custody?q=${encodeURIComponent(driverA.name)}`);
  await expect.poll(async () => digits(await overviewRow.getByTestId("custody-cash-held").textContent())).toBe("0");

  // Later: the unallocated list, and the remainder to the order it was kept from.
  await page.goto(`/finance/cash-receipts/unallocated?party_id=${driverA.id}`);
  const unallocated = page.getByTestId("receipts-table-unallocated").getByTestId("table-row");
  await expect(unallocated).toHaveCount(1);
  expect(digits(await unallocated.getByTestId("receipt-row-unallocated").textContent())).toBe("5000");
  await unallocated.getByTestId("receipt-row-allocate").click();
  await expect(page.getByTestId("receipt-allocate")).toBeVisible();
  await expect(page.getByTestId("receipt-allocate").getByTestId("allocation-row")).toHaveCount(1);
  await page.getByTestId("receipt-allocate").getByTestId("allocation-auto").click();
  await expect(page.getByTestId("receipt-allocate").getByTestId("allocation-amount")).toHaveValue("5000");
  await page.getByTestId("allocate-submit").click();
  await expect(page.getByTestId("receipt-notice")).toHaveAttribute("data-kind", "allocated");
  // Read again without a reload.
  await expect.poll(async () => digits(await page.getByTestId("receipt-unallocated").textContent())).toBe("0");
  await expect(page.getByTestId("receipt-batch")).toHaveCount(2);
  await expect(page.getByTestId("receipt-allocate")).toHaveCount(0);
  // Each allocated order links to its page.
  await expect(page.getByTestId("receipt-allocation-order").filter({ hasText: orders[2].order_number })).toHaveCount(2);
  await page.goto(`/finance/cash-receipts/unallocated?party_id=${driverA.id}`);
  await expect(page.getByTestId("receipts-table-unallocated").getByTestId("table-row")).toHaveCount(0);
  // Every order is settled now.
  const collections = (await api(request, "GET", `/admin/delivery-parties/${driverA.id}/collections?per_page=100`)).body.data as Array<{ settlement_status: string }>;
  expect(collections.map((row) => row.settlement_status)).toEqual(["settled", "settled", "settled"]);
});

test("a partial manual allocation leaves the rest unallocated and the order partly settled", async ({ page, request }) => {
  test.setTimeout(180_000);
  const orders = [await delivered(request, driverA.id), await delivered(request, driverA.id)];
  await uiLoginAsAdmin(page);
  await openReceive(page, request, driverA.id);
  const amount = orders[0].total + orders[1].total;
  await page.getByTestId("receive-amount").fill(String(amount));
  // By hand: 10,000 to the older order only.
  await page.getByTestId("allocation-amount").first().fill("10000");
  expect(digits(await page.getByTestId("allocation-allocated").textContent())).toBe("10000");
  expect(digits(await page.getByTestId("allocation-unallocated").textContent())).toBe(String(amount - 10000));
  await page.getByTestId("receive-review-button").click();
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  await page.getByTestId("receive-open-voucher").click();
  await expect(page.getByTestId("receipt-allocation")).toHaveCount(1);
  expect(digits(await page.getByTestId("receipt-allocated").textContent())).toBe("10000");
  expect(digits(await page.getByTestId("receipt-unallocated").textContent())).toBe(String(amount - 10000));
  const collections = (await api(request, "GET", `/admin/delivery-parties/${driverA.id}/collections?per_page=100`)).body.data as Array<{ order_id: string; settlement_status: string }>;
  expect(collections.find((row) => row.order_id === orders[0].id)?.settlement_status).toBe("partially_settled");
  expect(collections.find((row) => row.order_id === orders[1].id)?.settlement_status).toBe("unsettled");
});

test("every refusal from the API is said in words", async ({ page, request }) => {
  test.setTimeout(240_000);
  const driverB = await createDriver(request, "B");
  const [first, second] = [await delivered(request, driverB.id), await delivered(request, driverB.id)];
  await uiLoginAsAdmin(page);

  // More than the party holds: the page is open with 2 orders' worth held…
  await openReceive(page, request, driverB.id);
  await page.getByTestId("receive-all-held").click();
  await page.getByTestId("allocation-auto").click();
  await page.getByTestId("receive-review-button").click();
  // …and meanwhile the first order's cash is handed in elsewhere.
  await apiReceipt(request, driverB.id, first.total, [{ order_id: first.id, amount_iqd: String(first.total) }]);
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("receipt-refusal")).toHaveAttribute("data-kind", "overCustody");

  // More than is unsettled on an order: the first is settled now.
  await page.getByTestId("receive-edit").click();
  await page.getByTestId("receive-amount").fill(String(first.total));
  await page.getByTestId("allocation-clear").click();
  await page.getByTestId("allocation-amount").first().fill(String(first.total));
  await page.getByTestId("receive-review-button").click();
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("receipt-refusal")).toHaveAttribute("data-kind", "moreThanCollected");
  expect((await receiptsOf(request, driverB.id)).total).toBe(1);

  // More than is left on the receipt: a receipt with 10,000 unallocated…
  const receipt = await apiReceipt(request, driverB.id, 10000);
  await page.goto(`/finance/cash-receipts/${receipt.id}`);
  await page.getByTestId("receipt-allocate").getByTestId("allocation-auto").click();
  await expect(page.getByTestId("receipt-allocate").getByTestId("allocation-amount")).toHaveValue("10000");
  // …of which 1,000 is allocated elsewhere meanwhile.
  const elsewhere = await api(request, "POST", `/admin/cash-receipts/${receipt.id}/allocations`, {
    operation_id: `op-rcpt-api-${run}-${Math.random()}`,
    document_date: today(),
    allocations: [{ order_id: second.id, amount_iqd: "1000" }],
  });
  expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(201);
  await page.getByTestId("allocate-submit").click();
  await expect(page.getByTestId("receipt-refusal")).toHaveAttribute("data-kind", "overAllocation");

  // Another party's order: the screen only lists this party's, so the request
  // is rewritten on its way out — the refusal shown is the API's own.
  await page.reload();
  await page.route("**/api/proxy/admin/cash-receipts/*/allocations", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { allocations: Array<{ order_id: string }> };
    body.allocations[0].order_id = firstReceiptOrder;
    await route.continue({ postData: JSON.stringify(body) });
  });
  await page.getByTestId("receipt-allocate").getByTestId("allocation-amount").first().fill("1000");
  await page.getByTestId("allocate-submit").click();
  await expect(page.getByTestId("receipt-refusal")).toHaveAttribute("data-kind", "wrongParty");
  await page.unroute("**/api/proxy/admin/cash-receipts/*/allocations");
  // Nothing changed on the receipt.
  const after = (await api(request, "GET", `/admin/cash-receipts/${receipt.id}`)).body as { unallocated_amount_iqd: number };
  expect(after.unallocated_amount_iqd).toBe(9000);
});

test("a double click on confirm creates one voucher", async ({ page, request }) => {
  test.setTimeout(180_000);
  const driverC = await createDriver(request, "C");
  const order = await delivered(request, driverC.id);
  await uiLoginAsAdmin(page);
  const posts: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && /\/api\/proxy\/admin\/cash-receipts$/.test(new URL(sent.url()).pathname)) posts.push(sent.postData() ?? "");
  });
  await openReceive(page, request, driverC.id);
  await page.getByTestId("receive-amount").fill(String(order.total));
  await page.getByTestId("allocation-auto").click();
  await page.getByTestId("receive-review-button").click();
  await page.getByTestId("receive-confirm").dblclick();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  const ids = new Set(posts.map((body) => (JSON.parse(body) as { operation_id: string }).operation_id));
  expect(ids.size).toBe(1);
  expect((await receiptsOf(request, driverC.id)).total).toBe(1);
  expect(await cashHeld(request, driverC.id)).toBe(0);
});

test("a receipt is reversed by a second user, never by the one who posted it", async ({ page, request }) => {
  test.setTimeout(180_000);
  const cashier = await activateStaff(request, await createStaff(request, { presets: ["cashier"], prefix: "cashier" }));
  const heldBefore = await cashHeld(request, driverA.id);
  const voucher = (await api(request, "GET", `/admin/cash-receipts/${firstReceipt}`)).body as { amount_iqd: number; status: string };
  expect(voucher.status).toBe("active");

  // The admin posted it: the reversal is refused, in words, and nothing changes.
  await uiLoginAsAdmin(page);
  await page.goto(`/finance/cash-receipts/${firstReceipt}`);
  await page.getByTestId("receipt-reverse").click();
  await page.getByTestId("receipt-reverse-confirm").click();
  // A reason is required before anything is sent.
  await expect(page.getByTestId("error-reason")).toBeVisible();
  await page.getByTestId("receipt-reverse-reason").fill("Counted twice");
  await page.getByTestId("receipt-reverse-confirm").click();
  await expect(page.getByTestId("receipt-refusal")).toHaveAttribute("data-kind", "ownReceipt");
  await expect(page.getByTestId("receipt-status")).toHaveAttribute("data-status", "active");

  // A cashier reverses it: the cash is back in the party's custody.
  await switchUser(page, cashier.username, cashier.password);
  await page.goto(`/finance/cash-receipts/${firstReceipt}`);
  await page.getByTestId("receipt-reverse").click();
  await page.getByTestId("receipt-reverse-reason").fill("Counted twice");
  await page.getByTestId("receipt-reverse-confirm").click();
  await expect(page.getByTestId("receipt-notice")).toHaveAttribute("data-kind", "reversed");
  await expect(page.getByTestId("receipt-status")).toHaveAttribute("data-status", "reversed");
  await expect(page.getByTestId("receipt-reversal-reason")).toHaveText("Counted twice");
  await expect(page.getByTestId("receipt-reverse")).toHaveCount(0);
  expect(await cashHeld(request, driverA.id)).toBe(heldBefore + voucher.amount_iqd);
  await page.getByTestId("receipt-party").click();
  expect(digits(await page.getByTestId("custody-cash-amount").textContent())).toBe(String(heldBefore + voucher.amount_iqd));
  await expect(page.locator('[data-testid="cash-activity"][data-event="cash_receipt_reversed"]')).toHaveCount(1);
});

test("without the permissions, no receipt action is offered", async ({ page, request }) => {
  const viewer = await activateStaff(request, await createStaff(request, { permissionKeys: ["deliveries.manage"], prefix: "cashview" }));
  await uiLogin(page, viewer.username, viewer.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await page.goto("/finance/cash-receipts");
  await expect(page.getByTestId("receipts-table-vouchers")).toBeVisible();
  await expect(page.getByTestId("receipts-receive")).toHaveCount(0);
  await page.goto(`/finance/cash-receipts/unallocated?party_id=${driverA.id}`);
  await expect(page.getByTestId("receipt-row-allocate")).toHaveCount(0);
  await page.goto(`/delivery-parties/${driverA.id}`);
  await expect(page.getByTestId("party-receipts")).toBeVisible();
  await expect(page.getByTestId("party-receive")).toHaveCount(0);
  await page.goto("/delivery-parties/custody");
  await expect(page.getByTestId("custody-receive")).toHaveCount(0);
  const { body } = await api(request, "GET", `/admin/cash-receipts/unallocated?party_id=${driverA.id}`);
  const open = (body.data as Array<{ id: string }>)[0];
  expect(open, "driver A has an unallocated receipt from the partial allocation").toBeTruthy();
  await page.goto(`/finance/cash-receipts/${open.id}`);
  await expect(page.getByTestId("receipt-view")).toBeVisible();
  await expect(page.getByTestId("receipt-allocate")).toHaveCount(0);
  await expect(page.getByTestId("receipt-reverse")).toHaveCount(0);
  await page.goto("/finance/cash-receipts/new");
  await expect(page.getByTestId("receive-form")).toHaveCount(0);
});
