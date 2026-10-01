import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import {
  activateStaff,
  API,
  apiLogin,
  adminApiToken,
  bearer,
  createStaff,
  CUSTOMER_PHONE,
  phoneToken,
  requireLiveApi,
  uiLogin,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Inventory (API 8.2) in the Web Admin, in a real browser, through the BFF,
 * against a real API. Each run builds its own warehouse, locations and a
 * product with a piece SKU and a weighed SKU, so the run never depends on
 * seeded stock. Every behaviour the brief names is driven through the UI;
 * the API is called only to set a scenario up (a customer's order, a
 * movement that makes a count stale) or to verify what the UI cannot show
 * (the storefront's availability, a ledger entry, an idempotent replay).
 *
 * The tests share one story and run in order:
 * warehouse → opening → transfer → count → stale count → write-down.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CODE = `LV${run}`.slice(0, 20);
const SELL = "SELL";
const SELL2 = "SELL2";
const DAMAGED = "DMG";
/** Holds the double-submit test's stock, so DMG is empty (and can be deactivated) at the end. */
const EXTRA = "XTRA";
const PIECE = `LV-${run}-P`;
const WEIGHED = `LV-${run}-KG`;
const PRODUCT = `Live inventory ${run}`;
/** A visible seeded subcategory, so the product shows in the store. */
const CATEGORY = "30000000-0000-4000-8000-000000000023";

const state: {
  productId?: string;
  pieceId?: string;
  weighedId?: string;
  warehouseId?: string;
  locations: Record<string, string>;
  lotA?: string;
  lotB?: string;
  orderId?: string;
  openingId?: string;
} = { locations: {} };

async function api(request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: bearer(await adminApiToken(request)),
    data,
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

async function balanceOf(request: APIRequestContext, batchId: string, locationId: string) {
  const { body } = await api(request, "GET", `/admin/inventory/balances?batch_id=${batchId}&location_id=${locationId}`);
  return (body.data[0] ?? { quantity: 0, reserved: 0, available: 0 }) as { quantity: number; reserved: number; available: number };
}

function toast(page: Page) {
  return page.getByTestId("toast").last();
}

async function pickSku(page: Page | Locator, prefix: string, sku: string) {
  await page.getByTestId(`${prefix}-search`).fill(PRODUCT);
  await page.locator(`[data-testid="${prefix}-option"][data-sku="${sku}"]`).click();
  await expect(page.getByTestId(`${prefix}-picked`)).toContainText(sku);
}

test.beforeAll(async ({ request }) => {
  await requireLiveApi(request);
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: PRODUCT,
    name_ar: PRODUCT,
    price: 5000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [
      { sku: PIECE, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" },
      { sku: WEIGHED, base_unit: "kg", whole_units_only: false, pricing_mode: "fixed" },
    ],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  state.productId = created.body.id;
  for (const variant of created.body.variants) {
    if (variant.sku === PIECE) state.pieceId = variant.id;
    if (variant.sku === WEIGHED) state.weighedId = variant.id;
  }
});

/* ------------------------------------------------- warehouses & locations */

test("warehouses and locations: create, sellable flag, and an unused location is deleted", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/warehouses");
  await page.getByTestId("warehouse-new").click();
  const dialog = page.getByTestId("warehouse-dialog");
  await dialog.getByTestId("warehouse-code").fill(CODE);
  await dialog.getByTestId("warehouse-name").fill(`Live ${run}`);
  await dialog.getByTestId("dialog-submit").click();
  const card = page.locator(`[data-testid="warehouse-card"][data-code="${CODE}"]`);
  await expect(card).toBeVisible();

  for (const [code, sellable] of [
    [SELL, true],
    [SELL2, true],
    [DAMAGED, false],
    [EXTRA, true],
    ["TMP", true],
  ] as const) {
    await card.getByTestId("location-new").click();
    const form = page.getByTestId("location-dialog");
    await form.getByTestId("location-code").fill(code);
    if (!sellable) await form.getByTestId("location-sellable-input").uncheck();
    await form.getByTestId("dialog-submit").click();
    await expect(card.locator(`[data-testid="location-row"][data-code="${code}"]`)).toBeVisible();
  }
  await expect(card.locator(`[data-testid="location-row"][data-code="${DAMAGED}"]`).getByTestId("location-sellable")).not.toHaveText(
    await card.locator(`[data-testid="location-row"][data-code="${SELL}"]`).getByTestId("location-sellable").innerText(),
  );

  // Never used: deleting it is allowed.
  await card.locator(`[data-testid="location-row"][data-code="TMP"]`).getByTestId("location-delete").click();
  await page.getByTestId("confirm-submit").click();
  await expect(card.locator(`[data-testid="location-row"][data-code="TMP"]`)).toHaveCount(0);

  const { body } = await api(request, "GET", "/admin/inventory/warehouses");
  const warehouse = (body as Array<{ id: string; code: string; locations: Array<{ id: string; code: string; is_sellable: boolean }> }>).find(
    (row) => row.code === CODE,
  )!;
  state.warehouseId = warehouse.id;
  for (const location of warehouse.locations) state.locations[location.code] = location.id;
  expect(warehouse.locations.find((row) => row.code === DAMAGED)?.is_sellable).toBe(false);
});

/* ------------------------------------------------------------- opening */

test("opening stock: whole units per SKU, creates lots, and the store shows them available", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/openings/new");
  const lines = page.getByTestId("opening-line");

  // Line 1: the piece SKU, which refuses a fraction.
  await pickSku(lines.nth(0), "opening-sku", PIECE);
  await lines.nth(0).getByTestId("opening-location").selectOption(state.locations[SELL]!);
  await lines.nth(0).getByTestId("opening-quantity").fill("1.5");
  await lines.nth(0).getByTestId("opening-quantity").blur();
  await expect(lines.nth(0).getByTestId("number-error")).toBeVisible();
  await lines.nth(0).getByTestId("opening-quantity").fill("10");
  await lines.nth(0).getByTestId("opening-cost").fill("1000");
  await lines.nth(0).getByTestId("opening-lot").fill(`A-${run}`);

  // Line 2: the weighed SKU, which takes three decimals.
  await page.getByTestId("opening-add-line").click();
  await pickSku(lines.nth(1), "opening-sku", WEIGHED);
  await lines.nth(1).getByTestId("opening-location").selectOption(state.locations[SELL2]!);
  await lines.nth(1).getByTestId("opening-quantity").fill("5.5");
  await lines.nth(1).getByTestId("opening-cost").fill("2000");
  await lines.nth(1).getByTestId("opening-lot").fill(`B-${run}`);

  await page.getByTestId("opening-review").click();
  await expect(page.getByTestId("opening-preview-line")).toHaveCount(2);
  await page.getByTestId("opening-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();

  // The document: two lots, with costs for an admin (cost.view).
  await page.getByTestId("posting-document").click();
  await expect(page.getByTestId("document-line")).toHaveCount(2);
  await expect(page.getByTestId("cost-column")).toBeVisible();
  state.openingId = page.url().split("/").pop();
  const { body: opening } = await api(request, "GET", `/admin/inventory/documents/opening/${state.openingId}`);
  state.lotA = opening.lines.find((line: { variant_id: string }) => line.variant_id === state.pieceId).lot_id;
  state.lotB = opening.lines.find((line: { variant_id: string }) => line.variant_id === state.weighedId).lot_id;

  // What the web store reads: both SKUs now available.
  const product = await request.get(`${API}/products/${state.productId}`);
  expect(product.ok()).toBe(true);
  const variants = (await product.json()).variants as Array<{ sku: string; available_qty: number; in_stock: boolean }>;
  expect(variants.find((row) => row.sku === PIECE)).toMatchObject({ available_qty: 10, in_stock: true });
  expect(variants.find((row) => row.sku === WEIGHED)).toMatchObject({ available_qty: 5.5, in_stock: true });

  // The stock screen, by SKU: totals and the catalog's own state.
  await page.goto(`/inventory/stock?variant_id=${state.pieceId}`);
  await expect(page.getByTestId("summary-onHand")).toHaveText("10");
  await expect(page.getByTestId("summary-available")).toHaveText("10");
  await expect(page.getByTestId("sku-availability")).toHaveAttribute("data-state", "in_stock");
});

test("double-submit creates one document, and a replayed operation returns the same one", async ({ page, request }) => {
  const before = (await api(request, "GET", "/admin/inventory/openings?per_page=1")).body.total as number;
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/openings/new");
  const line = page.getByTestId("opening-line").first();
  await pickSku(line, "opening-sku", WEIGHED);
  await line.getByTestId("opening-location").selectOption(state.locations[EXTRA]!);
  await line.getByTestId("opening-quantity").fill("0.25");
  await line.getByTestId("opening-cost").fill("2000");
  await page.getByTestId("opening-review").click();

  const posts: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && sent.url().includes("/api/proxy/admin/inventory/openings")) posts.push(sent.postData() ?? "");
  });
  await page.getByTestId("opening-confirm").dblclick();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  expect(posts).toHaveLength(1);
  const after = (await api(request, "GET", "/admin/inventory/openings?per_page=1")).body.total as number;
  expect(after).toBe(before + 1);

  // The same operation id sent again (a retry) answers the same document.
  const sent = JSON.parse(posts[0]!);
  const replay = await api(request, "POST", "/admin/inventory/openings", sent);
  expect(replay.status).toBe(201);
  const { body: page1 } = await api(request, "GET", "/admin/inventory/openings?per_page=1");
  expect(replay.body.id).toBe(page1.data[0].id);
  expect(page1.total).toBe(after);
});

/* ------------------------------------------------------------ transfer */

async function placeOrder(request: APIRequestContext, quantity: number): Promise<string> {
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  let addressId = (addresses.data ?? addresses)?.[0]?.id as string | undefined;
  if (!addressId) {
    const created = await request.post(`${API}/addresses`, {
      headers,
      data: { label: "Live", city: "واسط", area: "الكوت", contact_phone: CUSTOMER_PHONE },
    });
    addressId = (await created.json()).id;
  }
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) await request.delete(`${API}/cart/items/${item.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, {
    headers,
    data: { product_id: state.productId, variant_id: state.pieceId, quantity },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `inv-live-${run}-${Date.now()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()).id as string;
}

test("transfer: reserved stock can't be moved, and the lot keeps its identity", async ({ page, request }) => {
  // A customer's order reserves 3 of lot A on the SELL shelf.
  state.orderId = await placeOrder(request, 3);
  expect(await balanceOf(request, state.lotA!, state.locations[SELL]!)).toMatchObject({ quantity: 10, reserved: 3, available: 7 });

  // The API itself refuses to move reserved stock.
  const refused = await api(request, "POST", "/admin/inventory/transfers", {
    operation_id: `live-xfer-refused-${run}`,
    document_date: today(),
    reason: "Live test: over the unreserved quantity",
    lines: [{ batch_id: state.lotA, from_location_id: state.locations[SELL], to_location_id: state.locations[SELL2], quantity: "8" }],
  });
  expect(refused.status).toBe(409);

  await uiLoginAsAdmin(page);
  await page.goto("/inventory/transfers/new");
  await page.getByTestId("picker-location").selectOption(state.locations[SELL]!);
  const row = page.locator(`[data-testid="picker-row"][data-sku="${PIECE}"]`);
  await expect(row.getByTestId("picker-available")).toHaveText("7");
  await row.getByTestId("picker-add").click();
  const line = page.getByTestId("transfer-line");
  await line.getByTestId("transfer-quantity").fill("8");
  await line.getByTestId("transfer-destination").selectOption(state.locations[SELL2]!);
  await page.getByTestId("transfer-reason").fill("Live test: rebalance shelves");
  await page.getByTestId("transfer-review").click();
  // Only unreserved quantity is selectable: 8 > 7 stays on the form.
  await expect(line.getByTestId("error-quantity")).toBeVisible();
  await expect(page.getByTestId("transfer-preview")).toHaveCount(0);

  await line.getByTestId("transfer-quantity").fill("4");
  await page.getByTestId("transfer-review").click();
  await page.getByTestId("transfer-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  await page.getByTestId("posting-document").click();
  await expect(page.getByTestId("document-to")).toContainText(SELL2);

  // Same lot, two locations: the lot page shows both, and the move.
  await page.getByTestId("document-lot").first().click();
  await expect(page.getByTestId("lot-detail")).toHaveAttribute("data-lot-id", state.lotA!);
  await expect(page.getByTestId("lot-number")).toHaveText(`A-${run}`);
  await expect(page.locator(`[data-testid="lot-balance"][data-location="${SELL}"]`).getByTestId("lot-balance-on-hand")).toHaveText("6");
  await expect(page.locator(`[data-testid="lot-balance"][data-location="${SELL2}"]`).getByTestId("lot-balance-on-hand")).toHaveText("4");
  await expect(page.locator('[data-testid="movement-type"][data-type="transfer"]')).toHaveCount(1);
  expect(await balanceOf(request, state.lotA!, state.locations[SELL]!)).toMatchObject({ quantity: 6, reserved: 3, available: 3 });
});

/* --------------------------------------------------------------- counts */

test("count: approve a shortage and a surplus, posted to the ledger", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/counts/new");
  await page.getByTestId("count-scope-location").check();
  await page.getByTestId("count-location").selectOption(state.locations[SELL2]!);
  await page.getByTestId("count-reason").fill("Live test: shelf count");
  await page.getByTestId("count-create").click();
  await expect(page.getByTestId("count-draft")).toBeVisible();

  const pieceLine = page.locator(`[data-testid="count-line"][data-sku="${PIECE}"]`);
  const weighedLine = page.locator(`[data-testid="count-line"][data-sku="${WEIGHED}"]`);
  await expect(pieceLine.getByTestId("count-system")).toHaveText("4");
  await expect(weighedLine.getByTestId("count-system")).toHaveText("5.5");
  await pieceLine.getByTestId("count-input").fill("3");
  await weighedLine.getByTestId("count-input").fill("7.25");
  await expect(pieceLine.getByTestId("count-difference")).toContainText("1");
  await expect(page.getByTestId("count-shortage")).toHaveText("1");
  await expect(page.getByTestId("count-surplus")).toHaveText("1.75");

  await page.getByTestId("count-review").click();
  await page.getByTestId("count-approve").click();
  await expect(page.getByTestId("count-approved")).toBeVisible();
  await expect(page.getByTestId("count-status")).toBeVisible();
  const entryLink = page.getByTestId("count-entry");
  await expect(entryLink).toBeVisible();

  // The journal: loss for the shortage, gain for the surplus.
  const countId = page.url().split("/").pop()!;
  const { body: count } = await api(request, "GET", `/admin/inventory/documents/count/${countId}`);
  expect(count.status).toBe("approved");
  const { body: entry } = await api(request, "GET", `/admin/ledger/entries/${count.journal_entry_id}`);
  const accounts = (entry.lines as Array<{ debit_base: string; account: { code: string } }>).map(
    (line) => `${Number(line.debit_base) > 0 ? "debit" : "credit"}:${line.account.code}`,
  );
  expect(accounts).toEqual(expect.arrayContaining(["debit:5010", "credit:1000", "debit:1000", "credit:5011"]));
  expect(await balanceOf(request, state.lotB!, state.locations[SELL2]!)).toMatchObject({ quantity: 7.25 });
});

test("a stale count is refused, re-verified on a fresh snapshot, and its reservation release shown", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/counts/new");
  await page.getByTestId("count-scope-location").check();
  await page.getByTestId("count-location").selectOption(state.locations[SELL]!);
  await page.getByTestId("count-reason").fill("Live test: stale count");
  await page.getByTestId("count-create").click();
  const line = page.locator(`[data-testid="count-line"][data-sku="${PIECE}"]`);
  await expect(line.getByTestId("count-system")).toHaveText("6");
  await line.getByTestId("count-input").fill("6");

  // Stock moves in the scope after the snapshot.
  const moved = await api(request, "POST", "/admin/inventory/transfers", {
    operation_id: `live-stale-${run}`,
    document_date: today(),
    reason: "Live test: movement after the snapshot",
    lines: [{ batch_id: state.lotA, from_location_id: state.locations[SELL], to_location_id: state.locations[SELL2], quantity: "1" }],
  });
  expect(moved.status, JSON.stringify(moved.body)).toBe(201);

  await page.getByTestId("count-review").click();
  await page.getByTestId("count-approve").click();
  await expect(page.getByTestId("count-stale")).toBeVisible();
  const staleUrl = page.url();

  // Re-verify: a fresh snapshot of the same scope, counts carried, the moved line flagged.
  await page.getByTestId("count-reverify-button").click();
  await expect(page).not.toHaveURL(staleUrl);
  await expect(page.getByTestId("count-carried")).toBeVisible();
  const fresh = page.locator(`[data-testid="count-line"][data-sku="${PIECE}"]`);
  await expect(fresh.getByTestId("count-system")).toHaveText("5");
  await expect(fresh.getByTestId("count-reverify")).toBeVisible();

  // Counting below what is reserved (3) releases 2 and flags the order.
  await fresh.getByTestId("count-input").fill("1");
  await expect(fresh.getByTestId("count-release-warning")).toBeVisible();
  await page.getByTestId("count-review").click();
  await page.getByTestId("count-approve").click();
  await expect(page.getByTestId("count-approved")).toBeVisible();
  await expect(page.getByTestId("count-released")).toBeVisible();
  expect(await balanceOf(request, state.lotA!, state.locations[SELL]!)).toMatchObject({ quantity: 1, reserved: 1 });
});

/* ----------------------------------------------------------- write-down */

test("write-down moves stock off the sellable shelf and posts the loss", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/write-downs/new");
  await page.getByTestId("picker-location").selectOption(state.locations[SELL2]!);
  await page.locator(`[data-testid="picker-row"][data-sku="${WEIGHED}"]`).getByTestId("picker-add").click();
  const line = page.getByTestId("write-down-line");
  await line.getByTestId("write-down-quantity").fill("2.25");
  await line.getByTestId("write-down-move-to").selectOption(state.locations[DAMAGED]!);
  await page.getByTestId("write-down-reason").fill("Live test: crushed in storage");
  await page.getByTestId("write-down-review").click();
  await expect(page.getByTestId("write-down-two-steps")).toBeVisible();
  await page.getByTestId("write-down-confirm").click();
  await expect(page.getByTestId("posting-done")).toHaveCount(2);

  await page.getByTestId("posting-document").last().click();
  await expect(page.getByTestId("inventory-document")).toHaveAttribute("data-type", "write_down");
  await expect(page.getByTestId("document-line")).toContainText(DAMAGED);
  await expect(page.getByTestId("document-entry")).toBeVisible();

  // The lot left the sellable shelf through the non-sellable location.
  expect(await balanceOf(request, state.lotB!, state.locations[SELL2]!)).toMatchObject({ quantity: 5 });
  expect(await balanceOf(request, state.lotB!, state.locations[DAMAGED]!)).toMatchObject({ quantity: 0 });
  const { body: movements } = await api(request, "GET", `/admin/inventory/movements?batch_id=${state.lotB}&per_page=10`);
  const types = (movements.data as Array<{ type: string; to_location: string | null; from_location: string | null }>).map((row) => row.type);
  expect(types).toEqual(expect.arrayContaining(["transfer", "write_down"]));
  const writeDown = (movements.data as Array<{ type: string; from_location: string | null }>).find((row) => row.type === "write_down");
  expect(writeDown?.from_location).toBe(state.locations[DAMAGED]);
});

/* -------------------------------------------- warehouses once used, reindex */

test("a used location can't be deleted (the API's message shows) or deactivated while stocked", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/inventory/warehouses");
  const card = page.locator(`[data-testid="warehouse-card"][data-code="${CODE}"]`);
  const sell = card.locator(`[data-testid="location-row"][data-code="${SELL}"]`);
  await sell.getByTestId("location-delete").click();
  await page.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("confirm-dialog").getByTestId("form-error")).toContainText("deactivate it instead");
  await page.getByTestId("confirm-dialog").getByRole("button").first().click();

  await sell.getByTestId("location-toggle").click();
  await expect(sell.getByTestId("location-toggle-error")).toContainText("cannot be deactivated");

  // The emptied quarantine location can be deactivated instead.
  const damaged = card.locator(`[data-testid="location-row"][data-code="${DAMAGED}"]`);
  await damaged.getByTestId("location-toggle").click();
  await expect(toast(page)).toBeVisible();
  await expect(damaged.getByTestId("location-status")).not.toHaveText(await sell.getByTestId("location-status").innerText());
});

test("product editor shows stock read-only with a link, and search reindex reports its result", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products/${state.productId}`);
  const piece = page.locator(`[data-testid="variant-stock-row"][data-sku="${PIECE}"]`);
  await expect(piece.getByTestId("variant-stock-reserved")).toHaveText("1");
  await expect(page.getByTestId("variant-stock").locator("input")).toHaveCount(0);
  await piece.getByTestId("variant-stock-link").click();
  await expect(page).toHaveURL(new RegExp(`/inventory/stock\\?variant_id=${state.pieceId}`));
  await expect(page.getByTestId("sku-summary")).toBeVisible();

  // The API answers only once the search engine has taken every product
  // (~0.4 s each, one after another), so this waits as long as that takes.
  test.setTimeout(240_000);
  await page.goto("/catalog/products");
  await page.getByTestId("reindex-open").click();
  await page.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("reindex-result")).toBeVisible({ timeout: 180_000 });
});

/* ------------------------------------------------------- cost visibility */

test("without cost.view, costs are hidden and actions are not offered", async ({ page, request }) => {
  const staff = await activateStaff(request, await createStaff(request, { permissionKeys: ["inventory.view"], prefix: "inv" }));
  await uiLogin(page, staff.username, staff.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();

  await page.goto(`/inventory/documents/opening/${state.openingId}`);
  await expect(page.getByTestId("document-line")).toHaveCount(2);
  await expect(page.getByTestId("cost-column")).toHaveCount(0);
  await expect(page.getByTestId("document-cost")).toHaveCount(0);

  await page.goto(`/inventory/lots/${state.lotA}`);
  await expect(page.getByTestId("lot-detail")).toBeVisible();
  await expect(page.getByTestId("lot-cost")).toHaveCount(0);
  await expect(page.getByTestId("movement-cost")).toHaveCount(0);

  await page.goto("/inventory/openings");
  await expect(page.getByTestId("documents-table")).toBeVisible();
  await expect(page.getByTestId("document-new")).toHaveCount(0);

  // And the API omits the figures themselves.
  const token = (await apiLogin(request, staff.username, staff.password)).body.access_token as string;
  const lot = await (await request.get(`${API}/admin/inventory/lots/${state.lotA}`, { headers: bearer(token) })).json();
  expect(lot).not.toHaveProperty("purchase_cost");
});
