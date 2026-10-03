import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import {
  activateStaff,
  API,
  adminApiToken,
  apiLogin,
  bearer,
  createStaff,
  CUSTOMER_PHONE,
  phoneToken,
  requireLiveApi,
  switchUser,
  uiLogin,
  uiLoginAsAdmin,
  unique,
} from "./helpers";

/**
 * Purchasing and suppliers (API 9.0) in the Web Admin, in a real browser,
 * through the BFF, against a real API. The PR #77 examples are driven
 * through the UI: pack conversion, landed cost by value, a USD purchase and
 * two payments with their FX difference, a 3-way cost correction, a return
 * blocked by reservations, a double submit, per-user drafts and cost
 * visibility.
 *
 * Purchases are posted by the seeded admin; payments, returns and
 * corrections by a second staff member, because the API refuses to let a
 * purchase's creator approve those (separation of duties).
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";

const state: {
  payer?: { username: string; password: string; id: string };
  agentId?: string;
  iqdSupplier?: { id: string; name: string };
  usdSupplier?: { id: string; name: string };
  usdCash?: string;
  iqdCash?: string;
  products: Record<string, { id: string; variant: string; sku: string; name: string }>;
  /** The first invoice (SKUs A and B), for the return of unreserved stock. */
  firstInvoiceId?: string;
} = { products: {} };

async function api(request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, data?: unknown, token?: string) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: bearer(token ?? (await adminApiToken(request))),
    data,
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

/** A published product with one SKU, for a scenario of its own. */
async function product(request: APIRequestContext, key: string, sku: string) {
  const name = `Live purchase ${key} ${run}`;
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: name,
    name_ar: name,
    price: 9000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  state.products[key] = { id: created.body.id, variant: created.body.variants[0].id, sku, name };
  return state.products[key]!;
}

async function pickSku(scope: Page | Locator, name: string, sku: string) {
  await scope.getByTestId("line-sku-search").fill(name);
  await scope.locator(`[data-testid="line-sku-option"][data-sku="${sku}"]`).click();
  await expect(scope.getByTestId("line-sku-picked")).toContainText(sku);
}

/** Fill a new purchase invoice's line `index` (0-based) through the UI. */
async function fillLine(page: Page, index: number, item: { name: string; sku: string }, packs: string, size: string, cost: string) {
  const line = page.getByTestId("invoice-line").nth(index);
  await pickSku(line, item.name, item.sku);
  await line.getByTestId("line-packs").fill(packs);
  await line.getByTestId("line-pack-size").fill(size);
  await line.getByTestId("line-cost").fill(cost);
}

async function postInvoice(page: Page): Promise<string> {
  await page.getByTestId("invoice-review-button").click();
  await page.getByTestId("invoice-confirm").click();
  await page.waitForURL(/\/purchasing\/invoices\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

/** A purchase invoice posted through the UI by the seeded admin: `packs` × 1 at `cost`. */
async function invoiceFor(page: Page, request: APIRequestContext, supplierId: string, key: string, packs: string, cost: string) {
  const item = await product(request, key, `PUR-${run}-${key}`);
  await uiLoginAsAdmin(page);
  await page.goto(`/purchasing/invoices/new?supplier_id=${supplierId}`);
  await fillLine(page, 0, item, packs, "1", cost);
  const id = await postInvoice(page);
  return (await api(request, "GET", `/admin/purchase-invoices/${id}`)).body as { id: string; document_number: string; currency_code: string; exchange_rate: number };
}

/** Open a new payment for `supplierId` from `cashId`, as the payer. */
async function startPayment(page: Page, supplierId: string, cashId: string, invoiceId: string) {
  await page.goto(`/purchasing/payments/new?supplier_id=${supplierId}&invoice_id=${invoiceId}`);
  await page.getByTestId("payment-cash").selectOption(cashId);
}

/** Review, confirm, and hand back what the API posted. */
async function confirmPayment(page: Page) {
  await page.getByTestId("payment-review-button").click();
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST" && candidate.url().includes("/api/proxy/admin/supplier-payments")),
    page.getByTestId("payment-confirm").click(),
  ]);
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function placeOrder(request: APIRequestContext, item: { id: string; variant: string }, quantity: number) {
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  const addressId = (addresses.data ?? addresses)[0].id as string;
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: item.id, variant_id: item.variant, quantity } });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `pur-live-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as { id: string; delivery_id: string };
}

/** Take an order to dispatched (its stock goes into the agent's custody). */
async function dispatch(request: APIRequestContext, order: { id: string; delivery_id: string }): Promise<number> {
  const detail = await api(request, "GET", `/admin/orders/${order.id}`);
  expect(detail.status, JSON.stringify(detail.body)).toBe(200);
  let version = detail.body.version as number;
  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const moved = await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status, version });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    version = moved.body.version as number;
  }
  const assigned = await api(request, "PATCH", `/deliveries/${order.delivery_id}/assign`, { agent_id: state.agentId });
  expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
  const dispatched = await api(request, "PATCH", `/admin/orders/${order.id}/status`, { status: "dispatched", version });
  expect(dispatched.status, JSON.stringify(dispatched.body)).toBe(200);
  return dispatched.body.version as number;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  await requireLiveApi(request);
  // The second staff member who approves payments, returns and corrections.
  const payer = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "payer" }));
  state.payer = { ...payer, id: payer.id };
  // A USD rate the server applies to documents posted after this setup, and
  // a USD cash account. It must be later than rates created by earlier specs.
  const rate = await api(request, "POST", "/admin/exchange-rates", {
    currency_code: "USD",
    rate: "1500",
    basis: 1,
    effective_at: new Date().toISOString(),
    reason: `Live purchasing ${run}`,
  });
  expect(rate.status, JSON.stringify(rate.body)).toBe(201);
  const cash = await api(request, "POST", "/admin/cash-accounts", { name: `Live USD ${run}`, kind: "cash", currency_code: "USD" });
  expect(cash.status, JSON.stringify(cash.body)).toBe(201);
  state.usdCash = cash.body.id;
  const iqdCash = await api(request, "POST", "/admin/cash-accounts", { name: `Live IQD ${run}`, kind: "cash", currency_code: "IQD" });
  expect(iqdCash.status, JSON.stringify(iqdCash.body)).toBe(201);
  state.iqdCash = iqdCash.body.id;
  const usd = await api(request, "POST", "/admin/suppliers", { name: `Live USD supplier ${run}`, default_currency: "USD", payment_terms_days: 15 });
  expect(usd.status).toBe(201);
  state.usdSupplier = usd.body;
  // The seeded delivery agent, for the custody scenario.
  const agentToken = await phoneToken(request, "+9647700000005");
  const me = await (await request.get(`${API}/me`, { headers: bearer(agentToken) })).json();
  state.agentId = me.id;
});

/* ------------------------------------------------------------ suppliers */

test("suppliers: create through the UI, then the invoice screen converts packs and allocates landed cost by value", async ({ page, request }) => {
  const a = await product(request, "A", `PUR-${run}-A`);
  const b = await product(request, "B", `PUR-${run}-B`);
  await uiLoginAsAdmin(page);
  await page.goto("/purchasing/suppliers");
  await page.getByTestId("supplier-new").click();
  const dialog = page.getByTestId("supplier-dialog");
  const name = `Live IQD supplier ${run}`;
  await dialog.getByTestId("supplier-name").fill(name);
  await dialog.getByTestId("supplier-terms").fill("30");
  await dialog.getByTestId("dialog-submit").click();
  await expect(page.getByTestId("supplier-title")).toHaveText(name);
  state.iqdSupplier = { id: page.url().split("/").pop()!, name };

  await page.getByRole("link", { name: /فاتورة شراء جديدة|New purchase invoice/ }).click();
  await expect(page.getByTestId("invoice-supplier")).toHaveValue(state.iqdSupplier.id);
  await page.getByTestId("invoice-number").fill(`S-${run}-1`);
  // 2 packs × 12 at 60,000 a pack → 24 units at 5,000.
  await fillLine(page, 0, a, "2", "12", "60000");
  const first = page.getByTestId("invoice-line").nth(0);
  await expect(first.getByTestId("line-base")).toHaveText("24 piece");
  await expect(first.getByTestId("line-base-cost")).toHaveText("5,000.00 IQD");
  await page.getByTestId("invoice-add-line").click();
  await fillLine(page, 1, b, "6", "1", "10000");
  // Freight 20,000 IQD by value: 120,000 and 60,000 → 13,333 and 6,667.
  await page.getByTestId("invoice-add-cost").click();
  await page.getByTestId("landed-kind").fill("Freight");
  await page.getByTestId("landed-amount").fill("20000");
  await expect(first.getByTestId("line-share")).toHaveText("13,333 IQD");
  await expect(page.getByTestId("invoice-line").nth(1).getByTestId("line-share")).toHaveText("6,667 IQD");
  await expect(page.getByTestId("invoice-shares-total")).toHaveText("20,000 IQD");
  await expect(page.getByTestId("invoice-total-iqd")).toHaveText("200,000 IQD");

  const id = await postInvoice(page);
  state.firstInvoiceId = id;
  // Read-only, with the stored conversion and links to the lots it created.
  await expect(page.getByTestId("invoice-detail")).toBeVisible();
  const row = page.locator(`[data-testid="invoice-line-row"][data-sku="${a.sku}"]`);
  await expect(row.getByTestId("invoice-line-base")).toContainText("24");
  await expect(row.getByTestId("invoice-line-base-cost")).toHaveText("5,000.00 IQD");
  await expect(row.getByTestId("invoice-line-share")).toHaveText("13,333.33 IQD");
  await expect(page.locator("input, textarea, select")).toHaveCount(0);
  const { body } = await api(request, "GET", `/admin/purchase-invoices/${id}`);
  expect(body.total_iqd).toBe(200000);
  await row.getByTestId("invoice-lot-link").click();
  await expect(page.getByTestId("lot-detail")).toBeVisible();
  await expect(page.getByTestId("lot-sku")).toHaveText(a.sku);
});

/* -------------------------------------------------- drafts and idempotency */

test("drafts are per user: one person's draft never appears for another", async ({ browser, request }) => {
  const admin = await browser.newPage();
  await uiLoginAsAdmin(admin);
  await admin.goto("/purchasing/invoices/new");
  await admin.getByTestId("invoice-number").fill(`DRAFT-${run}`);
  await expect(admin.getByTestId("draft-status")).toHaveAttribute("data-status", "saved");
  await admin.reload();
  await expect(admin.getByTestId("draft-restored")).toBeVisible();
  await expect(admin.getByTestId("invoice-number")).toHaveValue(`DRAFT-${run}`);

  const other = await browser.newPage();
  await uiLogin(other, state.payer!.username, state.payer!.password);
  await expect(other.getByTestId("dashboard")).toBeVisible();
  await other.goto("/purchasing/invoices/new");
  await expect(other.getByTestId("draft-bar")).toBeVisible();
  await expect(other.getByTestId("draft-restored")).toHaveCount(0);
  await expect(other.getByTestId("invoice-number")).toHaveValue("");
  // And on the API: the payer has no draft.
  const payerToken = (await apiLogin(request, state.payer!.username, state.payer!.password)).body.access_token as string;
  expect((await api(request, "GET", "/admin/drafts/purchase_invoice", undefined, payerToken)).status).toBe(404);

  await admin.getByTestId("draft-discard").click();
  await expect(admin.getByTestId("invoice-number")).toHaveValue("");
  expect((await api(request, "GET", "/admin/drafts/purchase_invoice")).status).toBe(404);
  await admin.close();
  await other.close();
});

test("double-submit creates one invoice, and a replay returns the same one", async ({ page, request }) => {
  const c = await product(request, "C", `PUR-${run}-C`);
  const before = (await api(request, "GET", `/admin/purchase-invoices?per_page=1&supplier_id=${state.iqdSupplier!.id}`)).body.total as number;
  await uiLoginAsAdmin(page);
  await page.goto(`/purchasing/invoices/new?supplier_id=${state.iqdSupplier!.id}`);
  await fillLine(page, 0, c, "10", "1", "1000");
  await page.getByTestId("invoice-review-button").click();
  const posts: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && sent.url().includes("/api/proxy/admin/purchase-invoices")) posts.push(sent.postData() ?? "");
  });
  await page.getByTestId("invoice-confirm").dblclick();
  await page.waitForURL(/\/purchasing\/invoices\/[0-9a-f-]{36}$/);
  expect(posts).toHaveLength(1);
  const id = page.url().split("/").pop()!;
  const after = (await api(request, "GET", `/admin/purchase-invoices?per_page=1&supplier_id=${state.iqdSupplier!.id}`)).body.total as number;
  expect(after).toBe(before + 1);
  const replay = await api(request, "POST", "/admin/purchase-invoices", JSON.parse(posts[0]!));
  expect(replay.status).toBe(201);
  expect(replay.body.id).toBe(id);
  expect((await api(request, "GET", `/admin/purchase-invoices?per_page=1&supplier_id=${state.iqdSupplier!.id}`)).body.total).toBe(after);
});

/* ---------------------------------------------------------- USD and FX */

test("USD 100 × 2 at 1,500, then payments at 1,520 and 1,480 show the FX before confirming", async ({ page, request }) => {
  const d = await product(request, "D", `PUR-${run}-D`);
  await uiLoginAsAdmin(page);
  await page.goto(`/purchasing/invoices/new?supplier_id=${state.usdSupplier!.id}`);
  await expect(page.getByTestId("invoice-currency")).toHaveValue("USD");
  await expect(page.getByTestId("invoice-rate")).toHaveValue("1500");
  await fillLine(page, 0, d, "2", "1", "100");
  await expect(page.getByTestId("invoice-subtotal")).toHaveText("200.00 USD");
  await expect(page.getByTestId("invoice-total-iqd")).toHaveText("300,000 IQD");
  const invoiceId = await postInvoice(page);
  const invoice = (await api(request, "GET", `/admin/purchase-invoices/${invoiceId}`)).body;
  expect(invoice.exchange_rate).toBe(1500);
  expect(invoice.total_iqd).toBe(300000);

  // Payments by someone other than the purchase's creator.
  await switchUser(page, state.payer!.username, state.payer!.password);
  for (const [rate, fx] of [
    ["1520", /2,000 IQD/],
    ["1480", /2,000 IQD/],
  ] as const) {
    await page.goto(`/purchasing/payments/new?supplier_id=${state.usdSupplier!.id}&invoice_id=${invoiceId}`);
    await page.getByTestId("payment-cash").selectOption(state.usdCash!);
    await page.getByTestId("payment-amount").fill("100");
    await page.getByTestId("payment-rate").fill(rate);
    const row = page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`);
    await row.getByTestId("payment-apply").fill("100");
    // Carried at 1,500 = 150,000; paid at 1,520 = 152,000 (loss) or 1,480 = 148,000 (gain).
    await expect(row.getByTestId("payment-row-fx")).toHaveText(fx);
    await expect(page.getByTestId("payment-fx")).toHaveText(rate === "1520" ? /خسارة|loss/i : /ربح|gain/i);
    await page.getByTestId("payment-review-button").click();
    await page.getByTestId("payment-confirm").click();
    await expect(page.getByTestId("posting-done")).toBeVisible();
  }
  const paid = (await api(request, "GET", `/admin/purchase-invoices/${invoiceId}`)).body;
  expect(paid.settlement_status).toBe("paid");
  const fxByAllocation = (paid.payment_allocations as Array<{ fx_difference_iqd: number }>).map((row) => row.fx_difference_iqd).sort((x, y) => x - y);
  expect(fxByAllocation).toEqual([-2000, 2000]);
});

/* ------------------------------------------- cross-currency (API 10.0.1) */

test("a USD invoice of 200 @ 1,500 paid from IQD 304,000 at 1,520 is settled; the FX loss of 4,000 is shown and posted", async ({ page, request }) => {
  const invoice = await invoiceFor(page, request, state.usdSupplier!.id, "G", "2", "100");
  expect(invoice.currency_code).toBe("USD");
  expect(invoice.exchange_rate).toBe(1500);

  await switchUser(page, state.payer!.username, state.payer!.password);
  await startPayment(page, state.usdSupplier!.id, state.iqdCash!, invoice.id);
  // An IQD account pays a USD invoice: the USD rate on the payment date is
  // shown, and the payer (purchases.override_rate) may set it.
  const rate = page.getByTestId("payment-rate");
  await expect(rate).toBeEnabled();
  await rate.fill("1520");
  const row = page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`);
  await expect(row).toHaveAttribute("data-cross", "true");
  await row.getByTestId("payment-settle").click();
  await expect(row.getByTestId("payment-apply")).toHaveValue(/^304,?000$/);
  await page.getByTestId("payment-amount").fill("304000");
  await expect(row.getByTestId("payment-row-rate")).toHaveText("1520");
  await expect(row.getByTestId("payment-row-converted")).toHaveText("200.00 USD");
  await expect(row.getByTestId("payment-row-paid")).toHaveText("304,000 IQD");
  await expect(row.getByTestId("payment-row-fx")).toHaveText(/4,000 IQD/);
  await expect(page.getByTestId("payment-fx")).toHaveText(/(خسارة|loss).*4,000 IQD/i);

  const posted = await confirmPayment(page);
  expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  await expect(page.getByTestId("posting-done")).toBeVisible();
  expect(posted.body.allocations[0]).toMatchObject({ amount_payment_currency: 304000, amount_invoice_currency: 200, fx_difference_iqd: 4000 });

  const settled = (await api(request, "GET", `/admin/purchase-invoices/${invoice.id}`)).body;
  expect(settled.settlement_status).toBe("paid");
  expect(settled.remaining_currency).toBe(0);
  // Posted: the supplier FX loss account (5030) carries the 4,000.
  const entry = (await api(request, "GET", `/admin/ledger/entries/${posted.body.journal_entry_id}`)).body;
  const fxLines = (entry.lines as Array<{ debit_base: number; credit_base: number; account: { code: string } }>).filter((line) => line.account.code === "5030");
  expect(fxLines.reduce((sum, line) => sum + Number(line.debit_base) - Number(line.credit_base), 0)).toBe(4000);
});

test("a partial cross-currency allocation: 76,000 IQD at 1,520 applies 50 USD; the rest settles later", async ({ page, request }) => {
  const invoice = await invoiceFor(page, request, state.usdSupplier!.id, "H", "2", "100");
  await switchUser(page, state.payer!.username, state.payer!.password);
  await startPayment(page, state.usdSupplier!.id, state.iqdCash!, invoice.id);
  await page.getByTestId("payment-rate").fill("1520");
  await page.getByTestId("payment-amount").fill("76000");
  const row = page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`);
  await row.getByTestId("payment-apply").fill("76000");
  await expect(row.getByTestId("payment-row-converted")).toHaveText("50.00 USD");
  await expect(row.getByTestId("payment-row-fx")).toHaveText(/1,000 IQD/);
  expect((await confirmPayment(page)).status).toBe(201);
  await expect(page.getByTestId("posting-done")).toBeVisible();
  const partial = (await api(request, "GET", `/admin/purchase-invoices/${invoice.id}`)).body;
  expect(partial.settlement_status).toBe("partial");
  expect(partial.remaining_currency).toBe(150);

  // The remaining 150 USD: "settle" fills 228,000 IQD at 1,520.
  await startPayment(page, state.usdSupplier!.id, state.iqdCash!, invoice.id);
  await page.getByTestId("payment-rate").fill("1520");
  const again = page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`);
  await expect(again).toContainText("150.00 USD");
  await again.getByTestId("payment-settle").click();
  await expect(again.getByTestId("payment-apply")).toHaveValue(/^228,?000$/);
  await page.getByTestId("payment-amount").fill("228000");
  await expect(again.getByTestId("payment-row-converted")).toHaveText("150.00 USD");
  expect((await confirmPayment(page)).status).toBe(201);
  await expect(page.getByTestId("posting-done")).toBeVisible();
  expect((await api(request, "GET", `/admin/purchase-invoices/${invoice.id}`)).body.settlement_status).toBe("paid");
});

test("an IQD invoice paid from a USD account at the payment-date rate, with no FX difference", async ({ page, request }) => {
  const invoice = await invoiceFor(page, request, state.iqdSupplier!.id, "I", "10", "15000");
  expect(invoice.currency_code).toBe("IQD");
  await switchUser(page, state.payer!.username, state.payer!.password);
  await startPayment(page, state.iqdSupplier!.id, state.usdCash!, invoice.id);
  // The payment-date rate as recorded (1,500), not overridden.
  await expect(page.getByTestId("payment-rate")).toHaveValue("1500");
  const row = page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`);
  await expect(row).toHaveAttribute("data-cross", "true");
  await row.getByTestId("payment-settle").click();
  await expect(row.getByTestId("payment-apply")).toHaveValue("100");
  await page.getByTestId("payment-amount").fill("100");
  await expect(row.getByTestId("payment-row-rate")).toHaveText("1500");
  await expect(row.getByTestId("payment-row-converted")).toHaveText("150,000 IQD");
  await expect(row.getByTestId("payment-row-fx")).not.toHaveText(/IQD/);

  const posted = await confirmPayment(page);
  expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  // Sent without a rate: the server applied the payment-date rate itself.
  expect(posted.body.exchange_rate).toBe(1500);
  expect(posted.body.allocations[0]).toMatchObject({ amount_payment_currency: 100, amount_invoice_currency: 150000, fx_difference_iqd: 0 });
  expect((await api(request, "GET", `/admin/purchase-invoices/${invoice.id}`)).body.settlement_status).toBe("paid");
});

test("a payment dated before any USD rate: the form says so before review, and the API's EXCHANGE_RATE_NOT_FOUND is shown with a link", async ({ page, request }) => {
  const invoice = await invoiceFor(page, request, state.usdSupplier!.id, "J", "1", "100");
  const OLD = "2001-01-15";

  // A payer who can read rates sees the gap before reviewing.
  await switchUser(page, state.payer!.username, state.payer!.password);
  await startPayment(page, state.usdSupplier!.id, state.iqdCash!, invoice.id);
  await page.getByTestId("payment-date").fill(OLD);
  await page.getByTestId("payment-backdate-reason").fill("Old supplier receipt found");
  const warning = page.getByTestId("payment-missing-rate");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(OLD);
  await expect(page.getByTestId("payment-missing-rate-link")).toHaveAttribute("href", "/finance/currencies");
  await page.getByTestId("payment-amount").fill("1000");
  await page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`).getByTestId("payment-apply").fill("1000");
  await page.getByTestId("payment-review-button").click();
  await expect(page.getByTestId("payment-problems")).toBeVisible();
  await expect(page.getByTestId("payment-review")).toHaveCount(0);

  // Someone who can't read rates (no ledger.view) posts, and the API refuses.
  const clerk = await activateStaff(
    request,
    await createStaff(request, {
      permissionKeys: ["supplier_payments.record", "suppliers.view", "cash_accounts.manage", "cost.view", "backdate.approve"],
      prefix: "clerk",
    }),
  );
  await switchUser(page, clerk.username, clerk.password);
  await startPayment(page, state.usdSupplier!.id, state.iqdCash!, invoice.id);
  await page.getByTestId("payment-date").fill(OLD);
  await page.getByTestId("payment-backdate-reason").fill("Old supplier receipt found");
  await expect(page.getByTestId("payment-rate")).toBeDisabled();
  await expect(page.getByTestId("payment-missing-rate")).toHaveCount(0);
  await page.getByTestId("payment-amount").fill("1000");
  await page.locator(`[data-testid="payment-invoice"][data-number="${invoice.document_number}"]`).getByTestId("payment-apply").fill("1000");
  const refused = await confirmPayment(page);
  expect(refused.status).toBe(422);
  expect(refused.body.code).toBe("EXCHANGE_RATE_NOT_FOUND");
  await expect(page.getByTestId("posting-missing-rate")).toBeVisible();
  await expect(page.getByTestId("posting-missing-rate-link")).toHaveAttribute("href", "/finance/currencies");
  expect((await api(request, "GET", `/admin/purchase-invoices/${invoice.id}`)).body.remaining_currency).toBe(100);
});

/* ------------------------------------------------------ cost corrections */

test("a late landed cost previews its 3-way split (stock 6, custody 2, sold 2) and posts the same", async ({ page, request }) => {
  test.setTimeout(240_000);
  const e = await product(request, "E", `PUR-${run}-E`);
  await uiLoginAsAdmin(page);
  await page.goto(`/purchasing/invoices/new?supplier_id=${state.iqdSupplier!.id}`);
  await fillLine(page, 0, e, "10", "1", "2000");
  const invoiceId = await postInvoice(page);

  // 2 out with a delivery agent, 2 delivered (sold), 6 still in stock.
  const custody = await placeOrder(request, e, 2);
  await dispatch(request, custody);
  const sold = await placeOrder(request, e, 2);
  const soldVersion = await dispatch(request, sold);
  const agentToken = await phoneToken(request, "+9647700000005");
  const delivered = await request.patch(`${API}/deliveries/${sold.delivery_id}`, {
    headers: bearer(agentToken),
    data: { status: "delivered", order_version: soldVersion },
  });
  expect(delivered.ok(), await delivered.text()).toBe(true);

  await switchUser(page, state.payer!.username, state.payer!.password);
  await page.goto(`/purchasing/corrections/new?invoice_id=${invoiceId}`);
  await page.getByTestId("correction-total").fill("1000");
  await page.getByTestId("correction-method").selectOption("quantity");
  const line = page.locator(`[data-testid="correction-line"][data-sku="${e.sku}"]`);
  await expect(line.getByTestId("split-stock-qty")).toHaveText("6");
  await expect(line.getByTestId("split-custody-qty")).toHaveText("2");
  await expect(line.getByTestId("split-sold-qty")).toHaveText("2");
  await expect(page.getByTestId("split-stock")).toHaveText("600 IQD");
  await expect(page.getByTestId("split-custody")).toHaveText("200 IQD");
  await expect(page.getByTestId("split-sold")).toHaveText("200 IQD");
  await page.getByTestId("correction-reason").fill("Late freight invoice");
  await page.getByTestId("correction-review-button").click();
  await page.getByTestId("correction-confirm").click();
  await expect(page.getByTestId("correction-posted-split")).toContainText("600");
  const corrected = (await api(request, "GET", `/admin/purchase-invoices/${invoiceId}`)).body;
  expect(corrected.corrections[0]).toMatchObject({ inventory_iqd: 600, custody_iqd: 200, cogs_iqd: 200 });
});

/* ---------------------------------------------------------------- returns */

test("a return is blocked on reserved quantity and allowed for the rest", async ({ page, request }) => {
  const f = await product(request, "F", `PUR-${run}-F`);
  await uiLoginAsAdmin(page);
  await page.goto(`/purchasing/invoices/new?supplier_id=${state.iqdSupplier!.id}`);
  await fillLine(page, 0, f, "3", "1", "5000");
  const invoiceId = await postInvoice(page);
  await placeOrder(request, f, 3);

  await switchUser(page, state.payer!.username, state.payer!.password);
  await page.goto(`/purchasing/returns/new?invoice_id=${invoiceId}`);
  const row = page.locator(`[data-testid="return-row"][data-sku="${f.sku}"]`);
  await expect(row.getByTestId("return-available")).toHaveText("0");
  await expect(row.getByTestId("return-blocked")).toBeVisible();
  await expect(row.getByTestId("return-quantity")).toHaveCount(0);
  // The API refuses the same thing.
  const invoice = (await api(request, "GET", `/admin/purchase-invoices/${invoiceId}`)).body;
  const payerToken = (await apiLogin(request, state.payer!.username, state.payer!.password)).body.access_token as string;
  const refused = await api(
    request,
    "POST",
    "/admin/supplier-returns",
    {
      operation_id: `pur-ret-${run}`,
      document_date: today(),
      supplier_id: state.iqdSupplier!.id,
      invoice_id: invoiceId,
      reason: "Live test: reserved stock",
      lines: [{ purchase_item_id: invoice.items[0].id, batch_id: invoice.items[0].lot_id, location_id: LOCATION, quantity: "1" }],
    },
    payerToken,
  );
  expect(refused.status).toBe(409);

  // An unreserved lot can go back, valued at its cost, reducing what is owed.
  const a = state.products.A!;
  await page.goto(`/purchasing/returns/new?invoice_id=${state.firstInvoiceId}`);
  const aRow = page.locator(`[data-testid="return-row"][data-sku="${a.sku}"]`);
  await aRow.getByTestId("return-quantity").fill("2");
  await expect(page.getByTestId("return-value-iqd")).toHaveText("11,111 IQD");
  await page.getByTestId("return-reason").fill("Damaged in transit");
  await page.getByTestId("return-review-button").click();
  await page.getByTestId("return-confirm").click();
  await expect(page.getByTestId("return-posted")).toBeVisible();
});

/* ---------------------------------------------------- reports and costs */

test("statement, balances and aging; without cost.view the costs are hidden", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto(`/purchasing/suppliers/${state.iqdSupplier!.id}`);
  await expect(page.getByTestId("statement-line").first()).toBeVisible();
  await expect(page.locator('[data-testid="statement-line"][data-source="supplier_return"]')).toHaveCount(1);
  await page.goto("/purchasing/reports");
  await expect(page.locator(`[data-testid="balance-row"][data-supplier="${state.iqdSupplier!.name}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="aging-row"][data-supplier="${state.iqdSupplier!.name}"]`).getByTestId("aging-current")).not.toHaveText("—");

  const viewer = await activateStaff(request, await createStaff(request, { permissionKeys: ["suppliers.view", "purchases.create"], prefix: unique("buyer").split(".")[0] }));
  await switchUser(page, viewer.username, viewer.password);
  const invoices = (await api(request, "GET", `/admin/purchase-invoices?supplier_id=${state.iqdSupplier!.id}&per_page=1`)).body.data;
  await page.goto(`/purchasing/invoices/${invoices[0].id}`);
  await expect(page.getByTestId("invoice-detail")).toBeVisible();
  await expect(page.getByTestId("cost-column")).toHaveCount(0);
  await expect(page.getByTestId("invoice-total")).toHaveCount(0);
  await expect(page.getByTestId("invoice-line-base-cost")).toHaveCount(0);
  const token = (await apiLogin(request, viewer.username, viewer.password)).body.access_token as string;
  const read = await api(request, "GET", `/admin/purchase-invoices/${invoices[0].id}`, undefined, token);
  expect(read.body).not.toHaveProperty("total_cost");
  expect(read.body.items[0]).not.toHaveProperty("unit_cost");
});
