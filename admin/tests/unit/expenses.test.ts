import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/errors";
import { isRouteEnabled, parseModules, routeModule } from "@/lib/modules";
import { visibleNav } from "@/lib/nav";
import { idempotencyHeader } from "@/lib/session/bff";
import {
  EXPENSE_REFUSAL_CODES,
  accountsFor,
  categoryNameProblems,
  expenseActions,
  expenseBody,
  expenseQueries,
  expenseRefusal,
  mappedAccounts,
  newIdempotencyKey,
  parseAmount,
  validateExpense,
  type CashAccountChoice,
  type ExpenseCategory,
  type ExpenseForm,
} from "@/lib/expenses";

const TODAY = "2026-10-18";
const accounts: CashAccountChoice[] = [
  { id: "till-iqd", name: "Till", currency_code: "IQD", is_active: true },
  { id: "bank-usd", name: "USD bank", currency_code: "USD", is_active: true },
  { id: "old-iqd", name: "Old till", currency_code: "IQD", is_active: false },
];

function form(overrides: Partial<ExpenseForm> = {}): ExpenseForm {
  return {
    documentDate: TODAY,
    backdateReason: "",
    categoryId: "cat-rent",
    amount: "1500000",
    currency: "IQD",
    payeeKind: "text",
    payee: "Landlord",
    supplierId: "",
    description: "October rent",
    referenceNumber: "",
    receiptId: "",
    paymentMode: "paid_now",
    cashAccountId: "till-iqd",
    ...overrides,
  };
}

const ctx = { precision: 0, cashAccounts: accounts, today: TODAY, windowDays: 90, canBackdate: false };

/* -------------------------------------------------------------- amounts */

describe("expense amounts", () => {
  it("takes an exact decimal string within the currency's precision", () => {
    expect(parseAmount("1500000", 0)).toEqual({ ok: true, value: "1500000" });
    expect(parseAmount("45.50", 2)).toEqual({ ok: true, value: "45.5" });
    expect(parseAmount("٤٥٫٥", 2)).toEqual({ ok: true, value: "45.5" });
    expect(parseAmount("1,250,000", 0)).toEqual({ ok: true, value: "1250000" });
    expect(parseAmount("12.5", 0)).toEqual({ ok: false, problem: "precision" });
    expect(parseAmount("12.345", 2)).toEqual({ ok: false, problem: "precision" });
  });

  it("refuses empty, non-numbers and zero", () => {
    expect(parseAmount("", 0)).toEqual({ ok: false, problem: "required" });
    expect(parseAmount("ten", 0)).toEqual({ ok: false, problem: "invalid" });
    expect(parseAmount("-5", 0)).toEqual({ ok: false, problem: "invalid" });
    expect(parseAmount("0", 0)).toEqual({ ok: false, problem: "zero" });
  });

  it("refuses an overpayment, and accepts paying exactly what is owed", () => {
    expect(parseAmount("700001", 0, 700000)).toEqual({ ok: false, problem: "overpayment" });
    expect(parseAmount("700000", 0, 700000)).toEqual({ ok: true, value: "700000" });
    expect(parseAmount("12.50", 2, 12.5)).toEqual({ ok: true, value: "12.5" });
  });
});

/* -------------------------------------------------------------- the form */

describe("new expense form", () => {
  it("accepts a complete paid-now expense", () => {
    expect(validateExpense(form(), ctx)).toEqual([]);
  });

  it("says what is missing", () => {
    expect(validateExpense(form({ categoryId: "", amount: "", payee: "", description: " ", cashAccountId: "" }), ctx)).toEqual([
      { field: "categoryId", problem: "required" },
      { field: "amount", problem: "required" },
      { field: "payee", problem: "required" },
      { field: "description", problem: "required" },
      { field: "cashAccountId", problem: "required" },
    ]);
  });

  it("checks the cash account against the expense's currency, and refuses an inactive one", () => {
    expect(validateExpense(form({ currency: "USD", amount: "45.50", cashAccountId: "till-iqd" }), { ...ctx, precision: 2 })).toEqual([
      { field: "cashAccountId", problem: "currency" },
    ]);
    expect(validateExpense(form({ cashAccountId: "old-iqd" }), ctx)).toEqual([{ field: "cashAccountId", problem: "inactive" }]);
    expect(accountsFor("USD", accounts).map((account) => account.id)).toEqual(["bank-usd"]);
    expect(accountsFor("IQD", accounts).map((account) => account.id)).toEqual(["till-iqd"]);
  });

  it("an owed expense needs no cash account; a supplier stands in for a payee", () => {
    expect(validateExpense(form({ paymentMode: "owed", cashAccountId: "" }), ctx)).toEqual([]);
    expect(validateExpense(form({ payeeKind: "supplier", payee: "", supplierId: "" }), ctx)).toEqual([{ field: "supplierId", problem: "required" }]);
  });

  it("applies the back-dating rule: no future dates, older than the window needs approval and a reason", () => {
    expect(validateExpense(form({ documentDate: "2026-10-19" }), ctx)).toEqual([{ field: "documentDate", problem: "future" }]);
    expect(validateExpense(form({ documentDate: "2026-06-01" }), ctx)).toEqual([{ field: "documentDate", problem: "needsBackdateApproval" }]);
    expect(validateExpense(form({ documentDate: "2026-06-01" }), { ...ctx, canBackdate: true })).toEqual([{ field: "documentDate", problem: "needsBackdateReason" }]);
    expect(validateExpense(form({ documentDate: "2026-06-01", backdateReason: "Found the bill late" }), { ...ctx, canBackdate: true })).toEqual([]);
  });

  it("builds the API body: cash account only when paid now, supplier or payee, optional fields only when set", () => {
    expect(expenseBody(form({ amount: "1,500,000", referenceNumber: " B-77 ", receiptId: "r-1" }), 0, TODAY)).toEqual({
      category_id: "cat-rent",
      amount: "1500000",
      currency_code: "IQD",
      payment_mode: "paid_now",
      cash_account_id: "till-iqd",
      payee: "Landlord",
      description: "October rent",
      reference_number: "B-77",
      receipt_media_id: "r-1",
      document_date: TODAY,
    });
    expect(expenseBody(form({ paymentMode: "owed", payeeKind: "supplier", supplierId: "sup-1", currency: "USD", amount: "45.50" }), 2, TODAY)).toEqual({
      category_id: "cat-rent",
      amount: "45.5",
      currency_code: "USD",
      payment_mode: "owed",
      supplier_id: "sup-1",
      description: "October rent",
      document_date: TODAY,
    });
    expect(expenseBody(form({ documentDate: "2026-06-01", backdateReason: "Late bill" }), 0, TODAY)).toMatchObject({ backdate_reason: "Late bill" });
  });
});

/* ----------------------------------------------------------- permissions */

describe("expense actions and separation of duties", () => {
  const draft = { status: "draft" as const, payment_mode: "owed" as const, balance_currency: 100, created_by: "alice" };
  const owedPosted = { ...draft, status: "posted" as const };
  const all = ["expenses.read", "expenses.post", "expenses.pay", "expenses.reverse"];

  it("offers each action only in its state and with its permission", () => {
    expect(expenseActions(draft, { permissions: all, userId: "bob", strict: false })).toEqual({
      post: { shown: true, blocked: false, ownDocument: false },
      pay: { shown: false },
      reverse: { shown: false },
    });
    expect(expenseActions(owedPosted, { permissions: all, userId: "bob", strict: false })).toEqual({
      post: { shown: false },
      pay: { shown: true, blocked: false, ownDocument: false },
      reverse: { shown: true, blocked: false, ownDocument: false },
    });
    // Fully paid, or paid now: nothing left to pay.
    expect(expenseActions({ ...owedPosted, balance_currency: 0 }, { permissions: all, userId: "bob", strict: false }).pay).toEqual({ shown: false });
    expect(expenseActions({ ...owedPosted, payment_mode: "paid_now" }, { permissions: all, userId: "bob", strict: false }).pay).toEqual({ shown: false });
    // Reversed: nothing at all.
    expect(Object.values(expenseActions({ ...owedPosted, status: "reversed" }, { permissions: all, userId: "bob", strict: false }))).toEqual([
      { shown: false },
      { shown: false },
      { shown: false },
    ]);
    // Without the permission, not offered.
    expect(expenseActions(draft, { permissions: ["expenses.read"], userId: "bob", strict: false }).post).toEqual({ shown: false });
  });

  it("the creator is blocked in strict mode, warned when the mode can't be read, free in standard mode", () => {
    expect(expenseActions(draft, { permissions: all, userId: "alice", strict: true }).post).toEqual({ shown: true, blocked: true });
    expect(expenseActions(owedPosted, { permissions: all, userId: "alice", strict: true }).pay).toEqual({ shown: true, blocked: true });
    expect(expenseActions(draft, { permissions: all, userId: "alice", strict: null }).post).toEqual({ shown: true, blocked: false, ownDocument: true });
    expect(expenseActions(draft, { permissions: all, userId: "alice", strict: false }).post).toEqual({ shown: true, blocked: false, ownDocument: true });
  });
});

/* ------------------------------------------------------------------ list */

describe("expense list queries", () => {
  it("maps every filter, the search box and the sort; totals leave paging and status out", () => {
    const { list, totals, ignoredDates } = expenseQueries({
      filters: { from: "2026-10-01", to: "2026-10-31", category_id: "11111111-1111-4111-8111-111111111111", status: "posted", cash_account_id: "22222222-2222-4222-8222-222222222222", payee: " Landlord ", unpaid_only: "true" },
      q: " rent ",
      page: 2,
      perPage: 20,
      sort: "amount",
      dir: "asc",
    });
    expect(list).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      category_id: "11111111-1111-4111-8111-111111111111",
      cash_account_id: "22222222-2222-4222-8222-222222222222",
      payee: "Landlord",
      unpaid_only: true,
      search: "rent",
      status: "posted",
      page: 2,
      per_page: 20,
      sort: "amount",
      direction: "asc",
    });
    expect(totals).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      category_id: "11111111-1111-4111-8111-111111111111",
      cash_account_id: "22222222-2222-4222-8222-222222222222",
      payee: "Landlord",
      unpaid_only: true,
      search: "rent",
    });
    expect(ignoredDates).toBe(false);
  });

  it("drops malformed values and an inverted date range", () => {
    const { list, ignoredDates } = expenseQueries({ filters: { from: "2026-10-31", to: "2026-10-01", category_id: "nope", status: "lost", unpaid_only: "yes" }, q: "", page: 1, perPage: 20, sort: "document_date", dir: "desc" });
    expect(list).toEqual({ page: 1, per_page: 20, sort: "document_date", direction: "desc" });
    expect(ignoredDates).toBe(true);
  });
});

/* -------------------------------------------------------------- categories */

describe("expense categories", () => {
  it("needs both names, up to 160 characters", () => {
    expect(categoryNameProblems({ ar: "إيجار", en: "Rent" })).toEqual({});
    expect(categoryNameProblems({ ar: " ", en: "x".repeat(161) })).toEqual({ ar: "required", en: "tooLong" });
  });

  it("offers the expense accounts the categories already map to, once each", () => {
    const account = (id: string, code: string, type = "expense") => ({ id, code, name_ar: code, name_en: code, type, normal_side: "debit", is_system: false, enabled: true, created_at: "" });
    const categories = [
      { id: "1", ledger_account: account("a2", "6200") },
      { id: "2", ledger_account: account("a1", "6100") },
      { id: "3", ledger_account: account("a2", "6200") },
      { id: "4", ledger_account: account("a9", "1000", "asset") },
    ] as unknown as ExpenseCategory[];
    expect(mappedAccounts(categories).map((entry) => entry.code)).toEqual(["6100", "6200"]);
  });
});

/* ---------------------------------------------------------- idempotency */

describe("idempotency keys", () => {
  it("are fresh and of the contract's shape", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[\x20-\x7E]{8,128}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });

  it("the BFF passes on only a key of the contract's shape", () => {
    const at = (value?: string) => ({ headers: new Headers(value === undefined ? {} : { "Idempotency-Key": value }) });
    expect(idempotencyHeader(at("exp-1234567890"))).toEqual({ "Idempotency-Key": "exp-1234567890" });
    expect(idempotencyHeader(at())).toEqual({});
    expect(idempotencyHeader(at("short"))).toEqual({});
    expect(idempotencyHeader(at("x".repeat(129)))).toEqual({});
    expect(idempotencyHeader(at("badékey123"))).toEqual({});
  });
});

/* -------------------------------------------------------------- refusals */

describe("expense refusals", () => {
  it("reads a declared code, and nothing else", () => {
    expect(expenseRefusal(new ApiError(403, "x", "EXPENSE_SELF_APPROVAL_FORBIDDEN"))).toBe("EXPENSE_SELF_APPROVAL_FORBIDDEN");
    expect(expenseRefusal(new ApiError(409, "x", "EXPENSE_OVERPAYMENT"))).toBe("EXPENSE_OVERPAYMENT");
    expect(expenseRefusal(new ApiError(422, "x", "VALIDATION_FAILED"))).toBeNull();
  });

  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: every declared code has its own message`, () => {
      const refusals = (messages.expenses as unknown as Record<string, Record<string, string>>).refusals;
      for (const code of EXPENSE_REFUSAL_CODES) expect(refusals[code], code).toBeTruthy();
    });
  }

  it("has the same message keys in both languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(ar.expenses).sort()).toEqual(keys(en.expenses).sort());
  });
});

/* ---------------------------------------------------------------- module */

describe("expenses module", () => {
  it("is its own module, off in the launch configuration", () => {
    expect(routeModule("/expenses")).toBe("expenses");
    expect(routeModule("/expenses/categories")).toBe("expenses");
    const launch = parseModules("catalog,stock,orders,settings,users");
    expect(isRouteEnabled("/expenses/new", launch)).toBe(false);
    expect(visibleNav(["expenses.read", "expense_categories.manage"], undefined, launch).map((entry) => entry.key)).not.toContain("expenses");
    expect(visibleNav(["expenses.read", "expense_categories.manage"], undefined, parseModules("expenses")).map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["expenses", "expenseCategories"]),
    );
    // Categories are managed with their own permission.
    expect(visibleNav(["expenses.read"], undefined, parseModules("expenses")).map((entry) => entry.key)).not.toContain("expenseCategories");
  });
});
