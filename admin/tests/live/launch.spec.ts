import type { APIRequestContext, Page } from "@playwright/test";
import { LAUNCH_MODULES } from "../../src/lib/modules";
import { expect, test } from "./fixtures";
import { API, adminApiToken, bearer, placeOrder, randomWorkPhone, requireLiveApi, uiLoginAsAdmin } from "./helpers";
import { choose, selectedValue } from "./controls";

/**
 * The launch workflows from the owner's test run (PR A11), with exactly the
 * launch module set (LAUNCH_MODULES): CI serves it from its own admin server
 * (ADMIN_LAUNCH_ORIGIN); locally, run this spec with ADMIN_MODULES set to the
 * launch set. Anywhere else it skips — it proves the launch menu or nothing.
 *
 * - restock one colour of a two-colour product through purchasing (a new
 *   supplier made inline, paid now): only that colour's stock goes up;
 * - opening stock with one line left empty: only the filled line is posted;
 * - the first delivery party, then accept → prepare → ready → hand over →
 *   delivered with the cash collected → that cash handed in as a cash receipt.
 */

test.describe.configure({ mode: "serial" });

const launchOrigin = process.env.ADMIN_LAUNCH_ORIGIN;
const launchMode = Boolean(launchOrigin) || process.env.ADMIN_MODULES === LAUNCH_MODULES;
if (launchOrigin) test.use({ baseURL: launchOrigin });

test.beforeEach(async ({ request }) => {
  test.skip(!launchMode, "needs the admin started with the launch modules (ADMIN_MODULES=LAUNCH_MODULES)");
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const digits = (text: string | null) => (text ?? "").replace(/[^\d]/g, "");

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

/** A product in two colours, black and red, published. */
async function twoColours(request: APIRequestContext, label: string) {
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Shirt ${label} ${run}`,
    name_ar: `قميص ${label} ${run}`,
    price: 15000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [
      { sku: `SH-${label}-BLK-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed", attributes: { اللون: "أسود" } },
      { sku: `SH-${label}-RED-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed", attributes: { اللون: "أحمر" } },
    ],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variants = created.body.variants as Array<{ id: string; sku: string }>;
  const black = variants.find((variant) => variant.sku.includes("-BLK-"))!;
  const red = variants.find((variant) => variant.sku.includes("-RED-"))!;
  return { id: created.body.id as string, black, red };
}

async function onHand(request: APIRequestContext, variantId: string): Promise<number> {
  const page = await api(request, "GET", `/admin/inventory/balances?variant_id=${variantId}&per_page=100`);
  return (page.body.data as Array<{ quantity: number }>).reduce((sum, row) => sum + Number(row.quantity), 0);
}

async function confirmDialog(page: Page) {
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  if (await dialog.getByTestId("customer-contacted").count()) {
    await dialog.getByTestId("customer-contacted").check();
    await dialog.getByTestId("customer-contact-note").fill("Customer confirmed by phone");
  }
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeHidden();
}

let tillId = "";
async function till(request: APIRequestContext): Promise<string> {
  if (tillId) return tillId;
  const created = await api(request, "POST", "/admin/cash-accounts", { name: `Launch till ${run}`, kind: "cash", currency_code: "IQD" });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  tillId = created.body.id as string;
  return tillId;
}

test("the launch menu: purchasing, delivery parties and cash receipts are on; trips and custody are off", async ({ page }) => {
  await uiLoginAsAdmin(page);
  const nav = page.getByTestId("sidebar-nav").first();
  for (const key of ["purchasing", "suppliers", "deliveryParties", "cashReceipts", "returns", "expenses", "reports", "audit", "openings"]) {
    await expect(nav.getByTestId(`nav-${key}`), key).toHaveCount(1);
  }
  for (const key of ["trips", "custodyExceptions"]) await expect(nav.getByTestId(`nav-${key}`), key).toHaveCount(0);
  await page.goto("/deliveries/trips");
  await expect(page.getByTestId("module-disabled")).toBeVisible();
  // Confirming a delivery's cash later (the Orders "collections" tab) is on.
  await page.goto("/deliveries/unconfirmed");
  await expect(page.getByTestId("module-disabled")).toHaveCount(0);
  await expect(page.getByTestId("orders-tab-collections")).toBeVisible();
  await page.goto("/purchasing/invoices/new");
  await expect(page.getByTestId("invoice-form")).toBeVisible();
  await page.goto("/reports");
  await expect(page.getByTestId("reports-hub")).toBeVisible();
});

test("restock one colour through purchasing: a new supplier made inline, paid now; only that colour goes up", async ({ page, request }) => {
  const product = await twoColours(request, "R");
  // Day-one stock for both colours, at 9,000 IQD a piece.
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `launch-open-${run}`,
    document_date: today(),
    lines: [
      { variant_id: product.black.id, location_id: LOCATION, quantity: "5", unit_cost_iqd: "9000" },
      { variant_id: product.red.id, location_id: LOCATION, quantity: "5", unit_cost_iqd: "9000" },
    ],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  const account = await till(request);

  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products/${product.id}`);
  // The product holds stock: Restock leads, opening stock steps back.
  await expect(page.getByTestId("product-restock")).toHaveAttribute("data-primary", "true");
  await expect(page.getByTestId("product-opening-stock")).toHaveAttribute("data-primary", "false");
  await page.getByTestId("product-restock").click();
  await page.waitForURL(new RegExp(`/purchasing/invoices/new\\?restock=${product.id}`));
  const form = page.getByTestId("invoice-form");
  await expect(form).toHaveAttribute("data-mode", "restock");

  // One line per colour, both empty, each starting at what was last paid.
  const lines = form.getByTestId("invoice-line");
  await expect(lines).toHaveCount(2);
  const red = lines.and(page.locator(`[data-sku="${product.red.sku}"]`));
  const black = lines.and(page.locator(`[data-sku="${product.black.sku}"]`));
  await expect(red).toHaveAttribute("data-blank", "true");
  await expect(black).toHaveAttribute("data-blank", "true");
  await expect(red.getByTestId("line-pack-cost")).toContainText("9,000");

  // A new supplier, without leaving the form: name and phone.
  await form.getByTestId("invoice-new-supplier").click();
  const dialog = page.getByTestId("supplier-dialog");
  await dialog.getByTestId("supplier-name").fill(`Basra Textiles ${run}`);
  await dialog.getByTestId("supplier-phone").fill("07701234567");
  await dialog.getByTestId("dialog-submit").click();
  await expect(dialog).toBeHidden();
  await expect(form.getByTestId("invoice-supplier-picked")).toContainText(`Basra Textiles ${run}`);

  // Only the red one: 4 pieces, through the product editor (VIS-022). Black stays empty and is left out.
  if ((await red.getAttribute("data-editing")) !== "true") await red.getByTestId("line-edit").click();
  const editor = form.getByTestId("invoice-editor");
  await expect(editor).toHaveAttribute("data-mode", "edit");
  await expect(editor.getByTestId("line-cost")).toHaveValue("9,000");
  await editor.getByTestId("line-packs").fill("4");
  await editor.getByTestId("invoice-editor-submit").click();
  await expect(red).toHaveAttribute("data-blank", "false");
  await expect(black.getByTestId("line-blank-badge")).toBeVisible();

  // Paid now from the till.
  await form.getByTestId("invoice-payment-now").check();
  await choose(form.getByTestId("invoice-cash-account"), account);

  // The whole invoice, 4 × 9,000, is what "paid now" pays.
  await expect(form.getByTestId("invoice-paid-amount")).toContainText("36,000");

  await form.getByTestId("invoice-review-button").click();
  const review = form.getByTestId("invoice-review");
  await expect(review.getByTestId("invoice-review-line")).toHaveCount(1);
  await expect(review.getByTestId("invoice-review-line")).toHaveAttribute("data-sku", product.red.sku);
  await expect(review.getByTestId("invoice-review-skipped")).toBeVisible();
  // One atomic call posts the invoice and the payment; no separate payment request.
  const posts: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && /\/api\/proxy\/admin\/(purchase-invoices|supplier-payments)/.test(sent.url())) posts.push(new URL(sent.url()).pathname);
  });
  await form.getByTestId("invoice-confirm").click();

  // The new stock per variant, and the way back to the product.
  const result = page.getByTestId("restock-result");
  await expect(result).toBeVisible();
  await expect(result.getByTestId("restock-result-row")).toHaveCount(1);
  const row = result.getByTestId("restock-result-row");
  await expect(row).toHaveAttribute("data-sku", product.red.sku);
  await expect(row.getByTestId("restock-result-added")).toContainText("4");
  await expect.poll(async () => digits(await row.getByTestId("restock-result-on-hand").textContent())).toBe("9");
  await expect(form.getByTestId("invoice-paid-now")).toBeVisible();
  expect(posts).toEqual(["/api/proxy/admin/purchase-invoices/paid-now"]);

  expect(await onHand(request, product.red.id)).toBe(9);
  expect(await onHand(request, product.black.id)).toBe(5);
  // The invoice (linked from the result) is from the new supplier and fully paid from the till.
  const href = (await result.getByTestId("restock-open-invoice").getAttribute("href")) ?? "";
  const invoiceId = href.split("/").pop() ?? "";
  const detail = await api(request, "GET", `/admin/purchase-invoices/${invoiceId}`);
  expect(detail.status, href).toBe(200);
  expect(detail.body.supplier?.name).toBe(`Basra Textiles ${run}`);
  expect(detail.body.settlement_status).toBe("paid");
  expect(Number(detail.body.remaining_currency)).toBe(0);

  await result.getByTestId("restock-back-to-product").click();
  await page.waitForURL(new RegExp(`/catalog/products/${product.id}$`));
});

test("opening stock with one empty line: it is skipped, the review lists only the posted line", async ({ page, request }) => {
  const product = await twoColours(request, "O");
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products/${product.id}`);
  // No stock yet: opening stock leads, Restock is there as well.
  await expect(page.getByTestId("product-opening-stock")).toHaveAttribute("data-primary", "true");
  await expect(page.getByTestId("product-restock")).toHaveAttribute("data-primary", "false");
  await page.getByTestId("product-opening-stock").click();
  await page.waitForURL(/\/inventory\/openings\/new\?product=/);
  await expect(page.getByTestId("opening-first-time")).toBeVisible();
  await expect(page.getByTestId("opening-to-restock")).toHaveAttribute("href", `/purchasing/invoices/new?restock=${product.id}`);

  const lines = page.getByTestId("opening-line");
  await expect(lines).toHaveCount(2);
  const blackLine = lines.filter({ hasText: product.black.sku });
  const redLine = lines.filter({ hasText: product.red.sku });
  const location = blackLine.getByTestId("opening-location");
  if (!(await selectedValue(location))) await choose(location, LOCATION);
  await blackLine.getByTestId("opening-quantity").fill("3");
  await blackLine.getByTestId("opening-cost").fill("8000");
  // The red line stays empty: marked, never refused.
  await expect(redLine.getByTestId("opening-line-skipped")).toBeVisible();
  await expect(page.getByTestId("opening-remove-empty")).toBeVisible();

  await page.getByTestId("opening-review").click();
  await expect(page.getByTestId("opening-preview-line")).toHaveCount(1);
  await expect(page.getByTestId("opening-preview-line")).toHaveAttribute("data-sku", product.black.sku);
  await expect(page.getByTestId("opening-preview-skipped")).toBeVisible();
  await page.getByTestId("opening-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();

  expect(await onHand(request, product.black.id)).toBe(3);
  expect(await onHand(request, product.red.id)).toBe(0);
});

test("delivery at launch: the first delivery party, hand over, deliver with the cash, then hand the cash in", async ({ page, request }) => {
  test.setTimeout(180_000);
  const driverName = `سائق المتجر ${run}`;
  const account = await till(request);
  const order = await placeOrder(request);

  await uiLoginAsAdmin(page);
  // With no delivery party at all, handing over says so and leads to adding one.
  // (The shared database has parties, so the empty answer is played back here.)
  await page.route("**/api/proxy/admin/delivery-parties?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [], total: 0, page: 1, per_page: 20 }) }),
  );
  await page.goto(`/orders/${order.id}`);
  for (const action of ["accept", "prepare", "markReady"]) {
    await page.getByTestId(`order-action-${action}`).click();
    await confirmDialog(page);
  }
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "ready_for_dispatch");
  await expect(page.getByTestId("party-none")).toBeVisible();
  await page.unroute("**/api/proxy/admin/delivery-parties?**");
  await page.getByTestId("party-add-first").click();
  await page.waitForURL(/\/delivery-parties/);

  // The store's own driver, as an external delivery party.
  const driverForm = page.getByTestId("driver-form");
  await driverForm.getByTestId("driver-name").fill(driverName);
  await driverForm.getByTestId("driver-phone").fill(randomWorkPhone());
  await driverForm.getByTestId("driver-submit").click();
  // Saved (the list is paginated, and other specs add drivers too: ask the API).
  await expect
    .poll(async () => {
      const found = await api(request, "GET", `/admin/delivery-parties?q=${encodeURIComponent(driverName)}&per_page=5`);
      return (found.body.data as Array<{ name: string }>).some((row) => row.name === driverName);
    })
    .toBe(true);

  // Hand over to that driver, then deliver with the whole amount collected.
  await page.goto(`/orders/${order.id}`);
  await page.getByTestId("party-search").fill(driverName);
  await page.locator('[data-testid="party-option"]').filter({ hasText: driverName }).first().click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("order-action-dispatch")).toBeEnabled();
  await page.getByTestId("order-action-dispatch").click();
  await confirmDialog(page);
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "dispatched");
  await page.getByTestId("order-action-deliver").click();
  const deliver = page.getByRole("dialog");
  await expect(deliver.getByTestId("collection-fields")).toBeVisible();
  const due = digits(await deliver.getByTestId("collection-due").textContent());
  await deliver.getByTestId("collection-confirmed").check();
  await deliver.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "delivered");
  // The order shows the collection.
  const summary = page.getByTestId("collection-summary");
  await expect(summary).toHaveAttribute("data-result", "full");
  expect(digits(await summary.getByTestId("collection-collected").textContent())).toBe(due);

  // The driver hands the cash in: a cash receipt allocated to the order.
  const parties = await api(request, "GET", `/admin/delivery-parties?q=${encodeURIComponent(driverName)}&per_page=5`);
  const partyId = (parties.body.data as Array<{ id: string; name: string }>).find((row) => row.name === driverName)!.id;
  await page.goto(`/finance/cash-receipts/new?party_id=${partyId}`);
  await expect(page.getByTestId("receive-form")).toBeVisible();
  expect(digits(await page.getByTestId("receive-cash-held").textContent())).toBe(due);
  await choose(page.getByTestId("receive-cash-account"), account);
  await page.getByTestId("receive-all-held").click();
  await page.getByTestId("allocation-auto").click();
  await page.getByTestId("receive-review-button").click();
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  await expect.poll(async () => digits(await page.getByTestId("receive-cash-held").textContent())).toBe("0");
  const custody = await api(request, "GET", `/admin/delivery-parties/${partyId}/custody`);
  expect(custody.body.cash.amount).toBe(0);
  const receipts = await api(request, "GET", `/admin/cash-receipts?party_id=${partyId}&per_page=5`);
  expect(receipts.body.data[0]).toMatchObject({ allocated_amount_iqd: Number(due), unallocated_amount_iqd: 0 });
});
