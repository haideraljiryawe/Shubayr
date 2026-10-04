import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  activateStaff,
  API,
  awaitHeadroom,
  adminApiToken,
  bearer,
  createStaff,
  CUSTOMER_PHONE,
  phoneToken,
  randomWorkPhone,
  requireLiveApi,
  switchUser,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Delivery parties and custody (contract 11.2) in the Web Admin, in a real
 * browser, through the BFF, against a real API: external drivers created and
 * retired in the UI, an order dispatched to one and found in their custody,
 * the custody statement paged by the server, and cost kept from a user
 * without cost.view.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const state: { driver?: { id: string; name: string }; orderNumber?: string } = {};

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

/** A published one-SKU product with opening stock on the seeded shelf. */
async function stocked(request: APIRequestContext, key: string, quantity: number) {
  const sku = `PTY-${run}-${key}`;
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Party ${key} ${run}`,
    name_ar: `جهة ${key} ${run}`,
    price: 9000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `pty-open-${run}-${key}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: LOCATION, quantity: String(quantity), unit_cost_iqd: "1000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  return { id: created.body.id as string, variant };
}

/** One COD order holding one piece of each item. */
async function order(request: APIRequestContext, items: Array<{ id: string; variant: string }>) {
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  let addressId = (addresses.data ?? addresses)?.[0]?.id as string | undefined;
  if (!addressId) {
    const created = await request.post(`${API}/addresses`, { headers, data: { label: "Live", city: "واسط", area: "الكوت", contact_phone: CUSTOMER_PHONE } });
    addressId = (await created.json()).id;
  }
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  for (const item of items) {
    const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: item.id, variant_id: item.variant, quantity: 1 } });
    expect(added.ok(), await added.text()).toBe(true);
  }
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `pty-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as { id: string; order_number: string; delivery_id: string };
}

async function move(request: APIRequestContext, id: string, statuses: string[]) {
  for (const status of statuses) {
    const { body } = await api(request, "GET", `/admin/orders/${id}`);
    const moved = await api(request, "PATCH", `/admin/orders/${id}/status`, { status, version: body.version });
    expect(moved.status, `${status}: ${JSON.stringify(moved.body)}`).toBe(200);
  }
}

async function createDriver(request: APIRequestContext, name: string) {
  const created = await api(request, "POST", "/admin/external-drivers", { name, phone: randomWorkPhone() });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return { id: created.body.id as string, name };
}

/** The parties table, narrowed by the server to one name. */
async function findParty(page: Page, name: string) {
  await page.goto(`/delivery-parties?q=${encodeURIComponent(name)}`);
  const row = page.locator('[data-testid="table-row"]', { hasText: name });
  await expect(row).toHaveCount(1);
  return row;
}

async function confirm(page: Page) {
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

test("an external driver is added, edited and deactivated; a repeated phone warns; an unused driver is deleted", async ({ page, request }) => {
  const name = `Ext ${run}`;
  const phone = randomWorkPhone();
  await uiLoginAsAdmin(page);
  await page.goto("/delivery-parties");
  await page.getByTestId("driver-name").fill(name);
  await page.getByTestId("driver-phone").fill(phone);
  await page.getByTestId("driver-vehicle").fill("KUT-1");
  await page.getByTestId("driver-submit").click();
  // Saved: the form empties for the next driver.
  await expect(page.getByTestId("driver-name")).toHaveValue("");
  await expect(page.getByTestId("party-notice")).toHaveCount(0);

  let row = await findParty(page, name);
  await expect(row.getByTestId("party-kind")).toHaveAttribute("data-kind", "external_driver");
  await expect(row.getByTestId("party-status")).toHaveAttribute("data-active", "true");
  await expect(row).toContainText("KUT-1");

  // Edit.
  await row.getByTestId("driver-edit").click();
  await expect(page.getByTestId("driver-name")).toHaveValue(name);
  await page.getByTestId("driver-vehicle").fill("KUT-2");
  await page.getByTestId("driver-submit").click();
  await expect(page.getByTestId("driver-name")).toHaveValue("");
  await expect(row).toContainText("KUT-2");

  // A second driver on the same phone is saved, with the API's warning.
  const twin = `Twin ${run}`;
  await page.getByTestId("driver-name").fill(twin);
  await page.getByTestId("driver-phone").fill(phone);
  await page.getByTestId("driver-submit").click();
  await expect(page.getByTestId("party-notice")).toHaveAttribute("data-kind", "duplicatePhone");

  // Deactivate the first: kept, inactive.
  row = await findParty(page, name);
  await row.getByTestId("driver-deactivate").click();
  await confirm(page);
  await expect(row.getByTestId("party-status")).toHaveAttribute("data-active", "false");
  await expect(row.getByTestId("driver-activate")).toBeVisible();
  const { body } = await api(request, "GET", `/admin/delivery-parties?q=${encodeURIComponent(name)}`);
  expect(body.data[0].is_active).toBe(false);

  // The unused twin is deleted outright.
  const twinRow = await findParty(page, twin);
  await twinRow.getByTestId("driver-remove").click();
  await confirm(page);
  await expect(page.getByTestId("party-notice")).toHaveAttribute("data-kind", "deleted");
  await expect(page.locator('[data-testid="table-row"]', { hasText: twin })).toHaveCount(0);
  expect((await api(request, "GET", `/admin/delivery-parties?q=${encodeURIComponent(twin)}`)).body.total).toBe(0);
});

test("an order dispatched to an external driver is in that driver's custody; removing a used driver keeps them inactive", async ({ page, request }) => {
  const driver = await createDriver(request, `Courier ${run}`);
  state.driver = driver;
  const item = await stocked(request, "ONE", 2);
  const placed = await order(request, [item]);
  state.orderNumber = placed.order_number;
  await move(request, placed.id, ["confirmed", "preparing", "ready_for_dispatch"]);

  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  // The picker lists delivery parties: the external driver is found by name.
  await page.getByTestId("party-search").fill(driver.name);
  const option = page.getByTestId("party-option");
  await expect(option).toHaveCount(1);
  await expect(option).toHaveAttribute("data-kind", "external_driver");
  await option.click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("delivery-agent")).toHaveText(driver.name);
  await expect(page.getByTestId("delivery-agent")).toHaveAttribute("data-kind", "external_driver");
  // An external driver has no agent account, and dispatch is still open.
  await page.getByTestId("order-action-dispatch").click();
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "dispatched");

  // From the list to the driver's custody.
  const row = await findParty(page, driver.name);
  await row.getByTestId("party-custody-link").click();
  await page.waitForURL(new RegExp(`/delivery-parties/${driver.id}`));
  await expect(page.getByTestId("party-name")).toHaveText(driver.name);
  await expect(page.locator(`[data-testid="custody-line"][data-order="${placed.order_number}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-testid="held-order"][data-order="${placed.order_number}"]`)).toHaveCount(1);
  await expect(page.getByTestId("custody-goods-quantity")).toHaveText("1");
  await expect(page.getByTestId("custody-goods-age")).not.toBeEmpty();
  await expect(page.getByTestId("statement-event").first()).toHaveAttribute("data-event", "issue_to_custody");
  // The admin has cost.view: lot cost and values are shown.
  await expect(page.getByTestId("custody-line-cost")).toContainText("1,000");
  await expect(page.getByTestId("custody-goods-value")).toBeVisible();

  // A driver with history is kept and made inactive, not deleted.
  const again = await findParty(page, driver.name);
  await again.getByTestId("driver-remove").click();
  await confirm(page);
  await expect(page.getByTestId("party-notice")).toHaveAttribute("data-kind", "deactivated");
  await expect(again.getByTestId("party-status")).toHaveAttribute("data-active", "false");
});

test("the custody statement pages, filters by date and by order on the server", async ({ page, request }) => {
  test.setTimeout(240_000);
  // One order of eleven SKUs handed to a driver: eleven statement lines, more
  // than a page of ten. (Not delivered: the API answers 500 when staff mark
  // an external driver's delivery delivered — reported to the backend.)
  await awaitHeadroom(request, 80);
  const driver = await createDriver(request, `Pager ${run}`);
  const items = [];
  for (let index = 1; index <= 11; index += 1) items.push(await stocked(request, `P${index}`, 1));
  const placed = await order(request, items);
  await move(request, placed.id, ["confirmed", "preparing", "ready_for_dispatch"]);
  const assigned = await api(request, "PATCH", `/deliveries/${placed.delivery_id}/assign`, { party_id: driver.id });
  expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
  await move(request, placed.id, ["dispatched"]);
  const { body: statement } = await api(request, "GET", `/admin/delivery-parties/${driver.id}/statement?per_page=100`);
  expect(statement.total).toBe(11);

  await awaitHeadroom(request);
  await uiLoginAsAdmin(page);
  await page.goto(`/delivery-parties/${driver.id}?per_page=10`);
  const table = page.getByTestId("party-statement");
  const rows = table.getByTestId("table-row");
  await expect(rows).toHaveCount(10);
  await expect(table.getByTestId("table-range")).toContainText("11");
  await expect(rows.first().getByTestId("statement-running")).toHaveText("1");
  await table.getByRole("button", { name: /الصفحة التالية|Next page/ }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows).toHaveCount(1);
  // The running balance carries across pages: the eleventh piece makes 11.
  await expect(rows.first().getByTestId("statement-running")).toHaveText("11");
  await expect(page.getByTestId("custody-goods-quantity")).toHaveText("11");

  // Date: a past month is empty; today has all of it.
  await page.goto(`/delivery-parties/${driver.id}?from=2001-01-01&to=2001-01-31`);
  await expect(rows).toHaveCount(0);
  await page.goto(`/delivery-parties/${driver.id}?from=${today()}&to=${today()}&per_page=50`);
  await expect(rows).toHaveCount(11);
  // Order: from a row, only that order's movements.
  await rows.first().getByTestId("statement-order").click();
  await expect(page).toHaveURL(new RegExp(`order_id=${placed.id}`));
  await expect(page.getByTestId("statement-order-filter")).toContainText(placed.order_number);
  await expect(rows).toHaveCount(11);
  await expect(table.getByTestId("statement-order").filter({ hasNotText: placed.order_number })).toHaveCount(0);
});

test("lot cost and values are hidden from a user without cost.view", async ({ page, request }) => {
  const viewer = await activateStaff(request, await createStaff(request, { permissionKeys: ["deliveries.manage"], prefix: "custody" }));
  await uiLoginAsAdmin(page);
  await switchUser(page, viewer.username, viewer.password);
  await page.goto(`/delivery-parties/${state.driver!.id}`);
  await expect(page.locator(`[data-testid="custody-line"][data-order="${state.orderNumber}"]`)).toHaveCount(1);
  await expect(page.getByTestId("custody-line-cost")).toHaveCount(0);
  await expect(page.getByTestId("custody-goods-value")).toHaveCount(0);
  await expect(page.getByTestId("statement-running-value")).toHaveCount(0);
  // The API itself leaves the values out for this user.
  const login = await request.post(`${API}/admin/auth/login`, { data: { username: viewer.username, password: viewer.password } });
  const token = (await login.json()).access_token as string;
  const custody = await (await request.get(`${API}/admin/delivery-parties/${state.driver!.id}/custody`, { headers: bearer(token) })).json();
  expect(custody.goods.value_iqd).toBeUndefined();
  expect(custody.goods.lines[0].unit_cost_iqd).toBeUndefined();
});
