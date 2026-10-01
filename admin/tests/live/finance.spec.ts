import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  API,
  activateStaff,
  adminApiToken,
  bearer,
  createStaff,
  requireLiveApi,
  uiLogin,
  uiLoginAsAdmin,
  unique,
} from "./helpers";

/**
 * The financial-core screens in a real browser, through the BFF, against a
 * real API. Accounts and periods are set up through the API; everything the
 * brief asks to prove is done through the UI.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

function storeDay(offsetDays = 0): string {
  const at = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(at);
}

/** The month before the store's current one, as YYYY-MM. */
function previousMonth(): string {
  const [year, month] = storeDay().split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

async function api(request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: bearer(await adminApiToken(request)),
    data,
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function createAccount(request: APIRequestContext, name: string): Promise<string> {
  const created = await api(request, "POST", "/admin/cash-accounts", { name, kind: "cash", currency_code: "IQD" });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.id as string;
}

async function cashTransferCount(request: APIRequestContext): Promise<number> {
  const entries = await api(request, "GET", "/admin/ledger/entries?source_type=cash_transfer&per_page=1");
  return entries.body.total as number;
}

async function ensureClosed(request: APIRequestContext, month: string): Promise<void> {
  const periods = await api(request, "GET", "/admin/accounting-periods");
  const row = (periods.body as Array<{ month: string; status: string }>).find((period) => period.month.startsWith(month));
  if (row?.status === "closed") return;
  const closed = await api(request, "POST", `/admin/accounting-periods/${month}/close`, {});
  expect(closed.status, JSON.stringify(closed.body)).toBe(201);
}

async function selectRateCurrency(page: Page) {
  await expect(page.getByTestId("rate-form")).toBeVisible();
  await page.getByTestId("rate-currency").selectOption("USD");
}

test("settings: invalid numbers stay next to the field; a save shows old → new", async ({ page, request }) => {
  const before = await api(request, "GET", "/admin/settings");
  const originalFee = before.body.settings.delivery_fee as string;
  const nextFee = originalFee === "5500" ? "6000" : "5500";
  await uiLoginAsAdmin(page);
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("settings-form")).toBeVisible();

  let puts = 0;
  page.on("request", (sent) => {
    if (sent.method() === "PUT" && sent.url().includes("/api/proxy/admin/settings")) puts += 1;
  });

  // An ambiguous separator is refused next to the field, and nothing is sent.
  const fee = page.getByTestId("setting-delivery_fee");
  await fee.fill("5,500");
  await fee.blur();
  await expect(page.getByTestId("number-error").first()).toBeVisible();
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-invalid")).toBeVisible();
  await expect(fee).toHaveValue("5,500");
  expect(puts).toBe(0);

  // Arabic-Indic digits are fine.
  const arabic = nextFee.replace(/\d/g, (digit) => String.fromCharCode(0x0660 + Number(digit)));
  await fee.fill(arabic);
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-history").getByTestId("settings-change").first()).toBeVisible();
  const change = page.locator('[data-testid="settings-change"][data-field="settings.delivery_fee"]').first();
  await expect(change).toContainText(`${originalFee} → ${nextFee}`);
  expect(puts).toBe(1);

  const after = await api(request, "GET", "/admin/settings");
  expect(after.body.settings.delivery_fee).toBe(nextFee);
  await api(request, "PUT", "/admin/settings", { settings: { delivery_fee: originalFee } });
});

test("a rate entered per 100 saves as the per-1 value; zero and negative are refused", async ({ page, request }) => {
  let posts = 0;
  page.on("request", (sent) => {
    if (sent.method() === "POST" && sent.url().includes("/api/proxy/admin/exchange-rates")) posts += 1;
  });
  await uiLoginAsAdmin(page);
  await page.goto("/finance/currencies");
  await expect(page.getByTestId("currency-base")).toBeVisible();
  await selectRateCurrency(page);

  // Never pre-filled — in particular never with 1.
  await expect(page.getByTestId("rate-value")).toHaveValue("");

  await page.getByTestId("rate-basis-100").check();
  await page.getByTestId("rate-reason").fill("Market quote per 100 USD");
  const rate = page.getByTestId("rate-value");
  await rate.fill("0");
  await page.getByTestId("rate-submit").click();
  await expect(page.getByTestId("error-rate")).toBeVisible();
  await rate.fill("-5");
  await rate.blur();
  await expect(page.getByTestId("number-error")).toBeVisible();
  await page.getByTestId("rate-submit").click();
  expect(posts).toBe(0);

  // The API refuses them too, whatever a client sends.
  for (const value of ["0", "0.000"]) {
    const refused = await api(request, "POST", "/admin/exchange-rates", {
      currency_code: "USD", rate: value, basis: 1, effective_at: new Date().toISOString(), reason: "Live test zero",
    });
    expect(refused.status, value).toBe(422);
  }

  await rate.fill("١٤٥٠٠٠");
  await expect(page.getByTestId("rate-preview-per1")).toHaveText("1 USD = 1,450 IQD");
  // A rate change is previewed first (its effect on linked prices), then
  // saved by an explicit choice — here the rate alone.
  const priorLatest = (await api(request, "GET", "/admin/exchange-rates?currency_code=USD")).body[0]?.id;
  await page.getByTestId("rate-submit").click();
  await expect(page.getByTestId("linked-preview")).toBeVisible();
  expect(posts).toBe(1);
  // A preview records nothing.
  expect((await api(request, "GET", "/admin/exchange-rates?currency_code=USD")).body[0]?.id).toBe(priorLatest);
  await page.getByTestId("rate-save-only").click();
  await expect(page.getByTestId("linked-preview")).toHaveCount(0);
  await expect(page.getByTestId("rate-row").first()).toBeVisible();
  const latest = await api(request, "GET", "/admin/exchange-rates?currency_code=USD");
  expect(Number(latest.body[0].rate)).toBe(1450);
  expect(latest.body[0].reason).toBe("Market quote per 100 USD");
  await expect(page.getByTestId("rate-row").first()).toContainText("1 USD = 1,450 IQD");
  expect(posts).toBe(2);
});

test("a transfer double-submit produces ONE document", async ({ page, request }) => {
  const from = unique("Box");
  const to = unique("Bank");
  const fromId = await createAccount(request, from);
  await createAccount(request, to);
  const opening = await api(request, "POST", `/admin/cash-accounts/${fromId}/opening-balance`, {
    operation_id: `op-${crypto.randomUUID()}`, amount: "100000", document_date: storeDay(),
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  const before = await cashTransferCount(request);

  await uiLoginAsAdmin(page);
  await page.goto("/finance/cash-accounts");
  await page.getByTestId("transfer-from").selectOption({ label: `${from} · IQD` });
  await page.getByTestId("transfer-to").selectOption({ label: `${to} · IQD` });
  await page.getByTestId("transfer-amount").fill("2500");
  await page.getByTestId("transfer-reason").fill("Double-click test");
  await page.getByTestId("transfer-review").click();
  await expect(page.getByTestId("transfer-preview-amount")).toHaveText("2,500 IQD");

  // A double click, then another click for good measure.
  await page.getByTestId("transfer-confirm").dblclick();
  await page.getByTestId("transfer-confirm").click({ force: true, trial: false }).catch(() => undefined);
  await expect(page.getByTestId("posting-done")).toBeVisible();
  expect(await cashTransferCount(request)).toBe(before + 1);
  await expect(page.locator(`[data-testid="account-row"][data-name="${from}"] [data-testid="account-balance"]`)).toHaveText("97,500 IQD");

  // Direct links (contract 8.1): the posted document, then its journal entry.
  await page.getByTestId("posting-document").click();
  await expect(page.getByTestId("document-view")).toHaveAttribute("data-type", "cash_transfer");
  await expect(page.getByTestId("document-amount")).toHaveText("2,500 IQD");
  await expect(page.getByTestId("document-from")).toHaveText(from);
  await expect(page.getByTestId("document-to")).toHaveText(to);
  const documentNumber = await page.getByTestId("document-number").innerText();
  await page.getByTestId("document-entry").click();
  await expect(page.getByTestId("entry-view")).toBeVisible();
  await expect(page.getByTestId("entry-line")).toHaveCount(2);
  await page.getByTestId("entry-document-link").click();
  await expect(page.getByTestId("document-number")).toHaveText(documentNumber);

  // At the API: two requests with one operation id are one document.
  const operationId = `op-${crypto.randomUUID()}`;
  const toId = (await api(request, "GET", "/admin/cash-accounts")).body.find((row: { name: string }) => row.name === to).id;
  const body = { operation_id: operationId, from_account_id: fromId, to_account_id: toId, amount: "100", document_date: storeDay(), reason: "Concurrent" };
  const [first, second] = await Promise.all([
    api(request, "POST", "/admin/cash-transfers", body),
    api(request, "POST", "/admin/cash-transfers", body),
  ]);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body.id).toBe(first.body.id);
  expect(await cashTransferCount(request)).toBe(before + 2);
});

test("after a lost answer the page asks the API before retrying", async ({ page, request }) => {
  const from = unique("Till");
  const to = unique("Safe");
  const fromId = await createAccount(request, from);
  await createAccount(request, to);
  await api(request, "POST", `/admin/cash-accounts/${fromId}/opening-balance`, {
    operation_id: `op-${crypto.randomUUID()}`, amount: "50000", document_date: storeDay(),
  });
  const before = await cashTransferCount(request);

  await uiLoginAsAdmin(page);
  await page.goto("/finance/cash-accounts");
  // The transfer reaches the server and is committed; its answer never
  // reaches the browser.
  await page.route("**/api/proxy/admin/cash-transfers", async (route) => {
    await route.fetch();
    await route.abort("connectionreset");
  });
  await page.getByTestId("transfer-from").selectOption({ label: `${from} · IQD` });
  await page.getByTestId("transfer-to").selectOption({ label: `${to} · IQD` });
  await page.getByTestId("transfer-amount").fill("1000");
  await page.getByTestId("transfer-reason").fill("Lost answer test");
  await page.getByTestId("transfer-review").click();
  const lookups: string[] = [];
  page.on("request", (sent) => {
    if (sent.url().includes("/api/proxy/admin/operations/")) lookups.push(sent.url());
  });
  await page.getByTestId("transfer-confirm").click();
  // Not an error, not a retry: the operation record says it was posted.
  await expect(page.getByTestId("posting-done")).toBeVisible();
  expect(lookups.length).toBe(1);
  expect(await cashTransferCount(request)).toBe(before + 1);
});

test("posting into a closed period is refused with the message; reopening needs a reason; re-close shows differences", async ({ page, request }) => {
  const month = previousMonth();
  const dated = `${month}-15`;
  await ensureClosed(request, month);
  const account = unique("Closed");
  await createAccount(request, account);

  await uiLoginAsAdmin(page);
  await page.goto("/finance/cash-accounts");
  await page.locator(`[data-testid="account-row"][data-name="${account}"]`).getByTestId("account-opening").click();
  await page.getByTestId("opening-amount").fill("7000");
  await page.getByTestId("opening-date").fill(dated);
  await page.getByTestId("opening-submit").click();
  await expect(page.getByTestId("posting-period-closed")).toBeVisible();

  // Reopen: the dialog will not confirm without a reason, and neither will the API.
  const refused = await api(request, "POST", `/admin/accounting-periods/${month}/reopen`, {});
  expect(refused.status).toBe(422);
  await page.goto(`/finance/periods/${month}`);
  await expect(page.getByTestId("period-view")).toHaveAttribute("data-status", "closed");
  await page.getByTestId("period-reopen").click();
  const dialog = page.getByTestId("confirm-dialog");
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("period-view")).toHaveAttribute("data-status", "closed");
  await dialog.getByTestId("confirm-reason").fill("Late opening balance to record");
  await dialog.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("period-view")).toHaveAttribute("data-status", "open");
  await expect(page.getByTestId("period-reopened")).toContainText("Late opening balance to record");

  // Now the late document posts, and re-closing shows what it changed.
  await page.goto("/finance/cash-accounts");
  await page.locator(`[data-testid="account-row"][data-name="${account}"]`).getByTestId("account-opening").click();
  await page.getByTestId("opening-amount").fill("7000");
  await page.getByTestId("opening-date").fill(dated);
  await page.getByTestId("opening-submit").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();

  await page.goto(`/finance/periods/${month}`);
  await expect(page.getByTestId("checklist")).toBeVisible();
  await page.getByTestId("period-close").click();
  await expect(page.getByTestId("period-view")).toHaveAttribute("data-status", "closed");
  await expect(page.getByTestId("reclose-differences")).toBeVisible();
  await expect(page.getByTestId("close-entry").first()).toBeVisible();
  expect(await page.getByTestId("close-entry").count()).toBeGreaterThanOrEqual(2);
});

test("a permission-limited user sees only the screens they may use", async ({ page, request }) => {
  const reader = await activateStaff(
    request,
    await createStaff(request, { permissionKeys: ["ledger.view"], prefix: "ledger-reader" }),
  );
  await uiLogin(page, reader.username, reader.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  const nav = page.getByTestId("sidebar-nav");
  for (const key of ["currencies", "periods", "ledger"]) {
    await expect(nav.getByTestId(`nav-${key}`), key).toBeVisible();
  }
  for (const key of ["cashAccounts", "settings", "orders", "staff"]) {
    await expect(nav.getByTestId(`nav-${key}`), key).toHaveCount(0);
  }
  for (const path of ["/settings", "/finance/cash-accounts"]) {
    await page.goto(path);
    await expect(page.getByTestId("forbidden"), path).toHaveAttribute("data-status", "403");
  }

  // Read-only where they may read: no toggles, no rate form, no close or reopen.
  await page.goto("/finance/currencies");
  await expect(page.getByTestId("currency-table")).toBeVisible();
  await expect(page.getByTestId("rate-form")).toHaveCount(0);
  await expect(page.locator('[data-testid^="currency-toggle-"]')).toHaveCount(0);
  await page.goto(`/finance/periods/${storeDay().slice(0, 7)}`);
  await expect(page.getByTestId("checklist-hidden")).toBeVisible();
  await expect(page.getByTestId("period-close")).toHaveCount(0);
  await page.goto(`/finance/periods/${previousMonth()}`);
  await expect(page.getByTestId("reopen-hidden")).toBeVisible();
  await page.goto("/finance/ledger");
  await expect(page.getByTestId("trial-balance")).toBeVisible();

  // The BFF refuses the writes this user was never shown.
  const origin = new URL(page.url()).origin;
  const write = await page.request.post("/api/proxy/admin/exchange-rates", {
    headers: { Origin: origin },
    data: { currency_code: "USD", rate: "1450", basis: 1, effective_at: new Date().toISOString(), reason: "Not allowed" },
  });
  expect(write.status()).toBe(403);
});

test("an entry links straight to its document, the entry it reverses and its reversal", async ({ page, request }) => {
  const account = unique("Reversed");
  const accountId = await createAccount(request, account);
  const opening = await api(request, "POST", `/admin/cash-accounts/${accountId}/opening-balance`, {
    operation_id: `op-${crypto.randomUUID()}`, amount: "4000", document_date: storeDay(),
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  const reversal = await api(request, "POST", `/admin/ledger/entries/${opening.body.journal_entry_id}/reversal`, {
    reason: "Live test reversal",
  });
  expect(reversal.status, JSON.stringify(reversal.body)).toBe(201);

  await uiLoginAsAdmin(page);
  // The list links each row to its entry, and a reversal to what it reverses.
  await page.goto(`/finance/ledger/entries?source_type=journal_reversal&source_id=${opening.body.journal_entry_id}`);
  await expect(page.getByTestId("entry-number")).toHaveText(reversal.body.document_number);
  await page.getByTestId("entry-number").click();
  await expect(page.getByTestId("entry-view")).toBeVisible();
  await expect(page.getByTestId("entry-reverses")).toBeVisible();
  await expect(page.getByTestId("entry-document-link")).toHaveCount(0);
  await page.getByTestId("entry-reverses").click();

  // The original: reversed by the entry above, and its opening-balance document.
  await expect(page.getByTestId("entry-reversed-by")).toHaveText(reversal.body.document_number);
  await page.getByTestId("entry-document-link").click();
  await expect(page.getByTestId("document-view")).toHaveAttribute("data-type", "cash_opening_balance");
  await expect(page.getByTestId("document-account")).toHaveText(account);
  await expect(page.getByTestId("document-amount")).toHaveText("4,000 IQD");

  // Unknown ids are a 404 page, not an error.
  const missing = await page.goto(`/finance/ledger/entries/${crypto.randomUUID()}`);
  expect(missing?.status()).toBe(404);
});
