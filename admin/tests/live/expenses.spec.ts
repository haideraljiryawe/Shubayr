import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN_PASSWORD, ADMIN_USERNAME, API, KNOWN_PASSWORD, activateStaff, adminApiToken, bearer, createStaff, postNewestRate, requireLiveApi, switchUser, uiLoginAsAdmin } from "./helpers";
import { choose, optionCount } from "./controls";

/**
 * Expenses (contract 17.1) in the Web Admin against a real API: an owed
 * expense saved as a draft with its receipt, posted, paid in two parts; a
 * USD expense at the central rate, paid now; a reversal with its correction;
 * and strict separation of duties refusing the creator, in words. Categories
 * are created, renamed and deactivated. Every write goes through the BFF
 * with its Idempotency-Key.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
// A 1×1 PNG, as a receipt photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function api(request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH", path: string, data?: unknown, headers: Record<string, string> = {}) {
  const response = await request.fetch(`${API}${path}`, { method, headers: { ...bearer(await adminApiToken(request)), ...headers }, data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

let setup: { categoryId: string; categoryName: string; tillId: string; usdId: string; usdName: string } | null = null;

/** This run's category, an IQD till and a USD account with a central rate of 1,500. */
async function prepare(request: APIRequestContext) {
  if (setup) return setup;
  const categoryName = `Rent ${run}`;
  const category = await api(request, "POST", "/admin/expense-categories", { name_ar: `إيجار ${run}`, name_en: categoryName });
  expect(category.status, JSON.stringify(category.body)).toBe(201);
  const till = await api(request, "POST", "/admin/cash-accounts", { name: `Expense till ${run}`, kind: "cash", currency_code: "IQD" });
  expect(till.status, JSON.stringify(till.body)).toBe(201);
  // The newest USD rate, whatever earlier specs posted in this run.
  const rate = await postNewestRate(request, { currency: "USD", rate: "1500", reason: `Live expenses ${run}` });
  expect(rate.status, JSON.stringify(rate.body)).toBe(201);
  const usdName = `Expense USD ${run}`;
  const usd = await api(request, "POST", "/admin/cash-accounts", { name: usdName, kind: "cash", currency_code: "USD" });
  expect(usd.status, JSON.stringify(usd.body)).toBe(201);
  setup = { categoryId: category.body.id, categoryName, tillId: till.body.id, usdId: usd.body.id, usdName };
  return setup;
}

async function setStrict(request: APIRequestContext, strict: boolean) {
  const saved = await api(request, "PUT", "/admin/settings", { settings: { separation_of_duties_level: strict ? "strict" : "standard" } });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
}

test.afterAll(async ({ request }) => {
  // Store-wide: leave the default for every other spec.
  await setStrict(request, false);
});

/** Fill the new-expense form and save the draft; resolves on the expense page. */
async function newExpense(page: Page, values: { category: string; amount: string; currency?: string; payee: string; description: string; mode: "paid_now" | "owed"; account?: string; receipt?: boolean }) {
  await page.goto("/expenses/new");
  const form = page.getByTestId("expense-form");
  await choose(form.getByTestId("expense-category"), values.category);
  if (values.currency) await choose(form.getByTestId("expense-currency"), values.currency);
  await form.getByTestId("expense-amount").fill(values.amount);
  await form.getByTestId("expense-payee").fill(values.payee);
  await form.getByTestId("expense-description").fill(values.description);
  await form.getByTestId(`expense-mode-${values.mode}`).check();
  if (values.account) await choose(form.getByTestId("expense-cash-account"), values.account);
  if (values.receipt) {
    await form.getByTestId("expense-receipt").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(form.getByTestId("expense-receipt-ready")).toContainText("receipt.png");
  }
  const [created] = await Promise.all([
    page.waitForRequest((sent) => sent.method() === "POST" && sent.url().endsWith("/api/proxy/admin/expenses")),
    form.getByTestId("expense-save").click(),
  ]);
  expect(created.headers()["idempotency-key"]).toMatch(/^exp-[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("expense-status")).toHaveAttribute("data-status", "draft");
  return page.url().split("/").pop()!;
}

test("an owed expense: draft with its receipt, posted, paid in two parts", async ({ page, request }) => {
  const { categoryId, tillId } = await prepare(request);
  await uiLoginAsAdmin(page);
  const id = await newExpense(page, { category: categoryId, amount: "1,000,000", payee: `Landlord ${run}`, description: "October rent", mode: "owed", receipt: true });

  // The private receipt, through the admin's own route.
  await expect(page.getByTestId("expense-receipt-image")).toBeVisible();
  const download = await page.request.get(`/api/expense-receipts/${(await api(request, "GET", `/admin/expenses/${id}`)).body.receipt.id}?download=1`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("image/png");
  expect(download.headers()["content-disposition"]).toContain("attachment");

  await page.getByTestId("expense-post-submit").click();
  await expect(page.getByTestId("expense-notice")).toHaveAttribute("data-action", "post");
  await expect(page.getByTestId("expense-status")).toHaveAttribute("data-status", "posted");
  await expect(page.getByTestId("expense-balance")).toContainText("1,000,000");

  // Part of it: more than owed is refused on the spot.
  const pay = page.getByTestId("expense-pay-panel");
  await choose(pay.getByTestId("expense-pay-account"), tillId);
  await pay.getByTestId("expense-pay-amount").fill("1000001");
  await pay.getByTestId("expense-pay-submit").click();
  await expect(pay).toContainText("أكثر مما بقي مستحقًا");
  await pay.getByTestId("expense-pay-amount").fill("400000");
  await pay.getByTestId("expense-pay-submit").click();
  await expect(page.getByTestId("expense-notice")).toHaveAttribute("data-action", "pay");
  await expect(page.getByTestId("expense-balance")).toContainText("600,000");
  await expect(page.getByTestId("expense-payment")).toHaveCount(1);

  // The rest: the amount offered is what is still owed.
  await expect(pay.getByTestId("expense-pay-amount")).toHaveValue("600,000");
  await choose(pay.getByTestId("expense-pay-account"), tillId);
  await pay.getByTestId("expense-pay-submit").click();
  await expect(page.getByTestId("expense-payment")).toHaveCount(2);
  await expect(page.getByTestId("expense-pay-panel")).toHaveCount(0);
  await expect(page.getByTestId("expense-remaining")).toContainText("0");

  const { body } = await api(request, "GET", `/admin/expenses/${id}`);
  expect(body.status).toBe("posted");
  expect(body.balance_currency).toBe(0);
  expect(body.payments.map((payment: { amount_currency: number }) => payment.amount_currency)).toEqual([400000, 600000]);
  // The posting plus one journal entry per payment.
  await expect(page.getByTestId("expense-journal")).toHaveCount(3);
  await expect(page.getByTestId("expense-event")).toHaveCount(4);
});

test("a USD expense at the central rate, paid now from a USD account", async ({ page, request }) => {
  const { categoryId, usdId } = await prepare(request);
  await uiLoginAsAdmin(page);
  await page.goto("/expenses/new");
  const form = page.getByTestId("expense-form");
  await choose(form.getByTestId("expense-currency"), "USD");
  await form.getByTestId("expense-amount").fill("45.50");
  await expect(form.getByTestId("expense-rate")).toContainText("1500");
  await expect(form.getByTestId("expense-rate-iqd")).toContainText("68,250");
  // Only USD cash accounts are offered for a USD expense.
  await form.getByTestId("expense-mode-paid_now").check();
  expect(await optionCount(form.getByTestId("expense-cash-account"), { value: usdId })).toBe(1);

  const id = await newExpense(page, { category: categoryId, amount: "45.50", currency: "USD", payee: `Hosting ${run}`, description: "Server", mode: "paid_now", account: usdId });
  await expect(page.getByTestId("expense-amount")).toContainText("45.50 USD");
  await expect(page.getByTestId("expense-amount-iqd")).toContainText("68,250 IQD");
  await page.getByTestId("expense-post-submit").click();
  await expect(page.getByTestId("expense-status")).toHaveAttribute("data-status", "posted");
  // Paid now: nothing left to pay.
  await expect(page.getByTestId("expense-pay-panel")).toHaveCount(0);
  const { body } = await api(request, "GET", `/admin/expenses/${id}`);
  expect(body).toMatchObject({ currency_code: "USD", amount_currency: 45.5, exchange_rate: 1500, amount_iqd: 68250, balance_currency: 0 });
});

test("a reversal: a reason, then a correction document that cancels every posting", async ({ page, request }) => {
  const { categoryId } = await prepare(request);
  const created = await api(request, "POST", "/admin/expenses", { category_id: categoryId, amount: "250000", currency_code: "IQD", payment_mode: "owed", payee: `Printer ${run}`, description: "Flyers", document_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date()) }, { "Idempotency-Key": `live-exp-${run}-rev` });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const posted = await api(request, "POST", `/admin/expenses/${created.body.id}/post`, {}, { "Idempotency-Key": `live-exp-${run}-rev-post` });
  expect(posted.status, JSON.stringify(posted.body)).toBe(200);

  await uiLoginAsAdmin(page);
  await page.goto(`/expenses/${created.body.id}`);
  await page.getByTestId("expense-reverse").click();
  const panel = page.getByTestId("expense-reverse-panel");
  await panel.getByTestId("expense-reverse-submit").click();
  await expect(panel).toContainText("3 أحرف على الأقل");
  await panel.getByTestId("expense-reverse-reason").fill("Printed twice by mistake");
  await panel.getByTestId("expense-reverse-submit").click();
  await expect(page.getByTestId("expense-status")).toHaveAttribute("data-status", "reversed");
  await expect(page.getByTestId("expense-correction")).toContainText("Printed twice by mistake");
  await expect(page.getByTestId("expense-reverse")).toHaveCount(0);
  await expect(page.getByTestId("expense-journal")).toHaveCount(2);
});

test("strict separation of duties: the creator is refused in words; someone else posts", async ({ page, request }) => {
  const { categoryId } = await prepare(request);
  // A clerk who creates and posts expenses, but can't read the settings — so
  // the page can't know the mode in advance, and the API's refusal explains.
  const clerk = await activateStaff(request, await createStaff(request, { permissionKeys: ["expenses.read", "expenses.create", "expenses.post"], prefix: "exp-clerk" }));
  await setStrict(request, true);
  try {
    await switchUser(page, clerk.username, KNOWN_PASSWORD);
    const id = await newExpense(page, { category: categoryId, amount: "75000", payee: `Cleaner ${run}`, description: "Office cleaning", mode: "owed" });
    await expect(page.getByTestId("expense-sod-hint")).toBeVisible();
    await page.getByTestId("expense-post-submit").click();
    await expect(page.getByTestId("expense-refusal")).toHaveAttribute("data-code", "EXPENSE_SELF_APPROVAL_FORBIDDEN");
    await expect(page.getByTestId("expense-refusal")).toContainText("من أنشأ المصروف لا يستطيع ترحيله");
    await expect(page.getByTestId("expense-status")).toHaveAttribute("data-status", "draft");

    // The admin, who can read the mode, posts it.
    await switchUser(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await page.goto(`/expenses/${id}`);
    await expect(page.getByTestId("expense-sod-blocked")).toHaveCount(0);
    await page.getByTestId("expense-post-submit").click();
    await expect(page.getByTestId("expense-status")).toHaveAttribute("data-status", "posted");
  } finally {
    await setStrict(request, false);
  }
});

test("categories: create, rename, deactivate — then it can't be chosen for a new expense", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/expenses/categories");
  const create = page.getByTestId("expense-category-create");
  await create.getByTestId("expense-category-create-submit").click();
  await expect(create).toContainText("أدخل الاسم");
  await create.getByTestId("expense-category-name-ar").fill(`وقود ${run}`);
  await create.getByTestId("expense-category-name-en").fill(`Fuel ${run}`);
  await create.getByTestId("expense-category-create-submit").click();
  const row = page.getByTestId("expense-category-row").filter({ hasText: `وقود ${run}` });
  await expect(row).toBeVisible();
  // The server created an expense account for it (coded EXP- and ten hex digits).
  await expect(row.getByTestId("expense-category-ledger")).toContainText(/EXP-[0-9A-F]{10}/);

  await row.getByTestId("expense-category-rename").click();
  await row.getByTestId("expense-category-edit-ar").fill(`وقود السيارة ${run}`);
  await row.getByTestId("expense-category-save").click();
  const renamed = page.getByTestId("expense-category-row").filter({ hasText: `وقود السيارة ${run}` });
  await expect(renamed).toBeVisible();

  await renamed.getByTestId("expense-category-deactivate").click();
  await expect(renamed).toHaveAttribute("data-active", "false");
  await page.goto("/expenses/new");
  expect(await optionCount(page.getByTestId("expense-category"), { hasText: `وقود السيارة ${run}` })).toBe(0);
});
