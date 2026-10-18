import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import { documentDateProblem, type DateProblem } from "@/lib/purchasing";
import { normalizeDigits } from "@/lib/number";

/* ---------------------------------------------------------------------------
 * Expenses (contract 17.1, phase 11): owner-managed categories mapped to
 * expense accounts; expense documents saved as drafts, then posted — paid
 * now from a cash account, or owed and paid later in parts; foreign-currency
 * amounts at the central rate; private receipts; corrections only by
 * reversal. Every write carries an Idempotency-Key. The API decides every
 * rule; this module only says what a form lacks and which action a person
 * may take. Pure, so the unit tests cover it.
 * ------------------------------------------------------------------------- */

export type Expense = components["schemas"]["Expense"];
export type ExpenseSummary = components["schemas"]["ExpenseSummary"];
export type ExpenseCategory = components["schemas"]["ExpenseCategory"];
export type ExpenseTotals = components["schemas"]["ExpenseTotals"];
export type ExpenseCreateInput = components["schemas"]["ExpenseCreateInput"];
export type ExpenseStatus = Expense["status"];
export type PaymentMode = Expense["payment_mode"];

export const EXPENSE_STATUSES = ["draft", "posted", "reversed"] as const satisfies readonly ExpenseStatus[];
export const PAYMENT_MODES = ["paid_now", "owed"] as const satisfies readonly PaymentMode[];

/** What the API accepts as a receipt (ExpenseReceiptUpload.mime_type), up to 8 MiB. */
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"] as const;
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

/* ------------------------------------------------------------ permissions */

export const EXPENSE_PERMISSIONS = {
  read: "expenses.read",
  create: "expenses.create",
  post: "expenses.post",
  pay: "expenses.pay",
  reverse: "expenses.reverse",
  categories: "expense_categories.manage",
} as const;

export type ExpenseAction = "post" | "pay" | "reverse";

export type ActionState =
  | { shown: false }
  /** Offered. `ownDocument`: the person created it — refused in strict mode. */
  | { shown: true; blocked: false; ownDocument: boolean }
  /** Shown but not possible: strict separation of duties and their own document. */
  | { shown: true; blocked: true };

/**
 * Whether each action is offered to this person on this expense. `strict` is
 * the separation-of-duties level when the page could read it (settings), or
 * null when it couldn't: then the person's own document is offered with a
 * warning, and the API's EXPENSE_SELF_APPROVAL_FORBIDDEN explains the rest.
 */
export function expenseActions(
  expense: Pick<Expense, "status" | "payment_mode" | "balance_currency" | "created_by">,
  ctx: { permissions: readonly string[]; userId: string | null; strict: boolean | null },
): Record<ExpenseAction, ActionState> {
  const own = Boolean(ctx.userId && expense.created_by === ctx.userId);
  const state = (possible: boolean, permission: string): ActionState => {
    if (!possible || !ctx.permissions.includes(permission)) return { shown: false };
    if (own && ctx.strict === true) return { shown: true, blocked: true };
    return { shown: true, blocked: false, ownDocument: own };
  };
  return {
    post: state(expense.status === "draft", EXPENSE_PERMISSIONS.post),
    pay: state(expense.status === "posted" && expense.payment_mode === "owed" && expense.balance_currency > 0, EXPENSE_PERMISSIONS.pay),
    reverse: state(expense.status === "posted", EXPENSE_PERMISSIONS.reverse),
  };
}

/* ---------------------------------------------------------------- amounts */

/** Fractional digits per currency; the store's own two when the list can't be read. */
export const DEFAULT_PRECISION: Readonly<Record<string, number>> = { IQD: 0, USD: 2 };

export type AmountProblem = "required" | "invalid" | "zero" | "precision" | "overpayment";

/** A typed amount as the API's exact decimal string ("1250000", "45.50"), or why not. */
export function parseAmount(
  text: string,
  precision: number,
  max?: number,
): { ok: true; value: string } | { ok: false; problem: AmountProblem } {
  const cleaned = normalizeDigits(text).trim().replace(/[٬,\s]/g, "").replace(/٫/g, ".");
  if (!cleaned) return { ok: false, problem: "required" };
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return { ok: false, problem: "invalid" };
  const [whole, fraction = ""] = cleaned.split(".");
  const significant = fraction.replace(/0+$/, "");
  if (significant.length > precision) return { ok: false, problem: "precision" };
  const value = significant ? `${BigInt(whole)}.${significant}` : `${BigInt(whole)}`;
  if (Number(value) <= 0) return { ok: false, problem: "zero" };
  if (max !== undefined && Number(value) > max + 1e-9) return { ok: false, problem: "overpayment" };
  return { ok: true, value };
}

/* ------------------------------------------------------------- new expense */

export interface ExpenseForm {
  documentDate: string;
  backdateReason: string;
  categoryId: string;
  amount: string;
  currency: string;
  /** Who was paid: free text, or a supplier from the list. */
  payeeKind: "text" | "supplier";
  payee: string;
  supplierId: string;
  description: string;
  referenceNumber: string;
  receiptId: string;
  paymentMode: PaymentMode;
  cashAccountId: string;
}

export interface CashAccountChoice {
  id: string;
  name: string;
  currency_code: string;
  is_active: boolean;
}

export type ExpenseFormProblem =
  | { field: "documentDate"; problem: NonNullable<DateProblem> }
  | { field: "categoryId"; problem: "required" }
  | { field: "amount"; problem: AmountProblem }
  | { field: "payee"; problem: "required" }
  | { field: "supplierId"; problem: "required" }
  | { field: "description"; problem: "required" | "tooLong" }
  | { field: "referenceNumber"; problem: "tooLong" }
  | { field: "cashAccountId"; problem: "required" | "currency" | "inactive" };

export function validateExpense(
  form: ExpenseForm,
  ctx: { precision: number; cashAccounts: readonly CashAccountChoice[] | null; today: string; windowDays: number; canBackdate: boolean },
): ExpenseFormProblem[] {
  const problems: ExpenseFormProblem[] = [];
  const date = documentDateProblem(form.documentDate, ctx.today, { windowDays: ctx.windowDays, canBackdate: ctx.canBackdate, reason: form.backdateReason });
  if (date) problems.push({ field: "documentDate", problem: date });
  if (!form.categoryId) problems.push({ field: "categoryId", problem: "required" });
  const amount = parseAmount(form.amount, ctx.precision);
  if (!amount.ok) problems.push({ field: "amount", problem: amount.problem });
  if (form.payeeKind === "text" && !form.payee.trim()) problems.push({ field: "payee", problem: "required" });
  if (form.payeeKind === "supplier" && !form.supplierId) problems.push({ field: "supplierId", problem: "required" });
  if (!form.description.trim()) problems.push({ field: "description", problem: "required" });
  else if (form.description.trim().length > 2000) problems.push({ field: "description", problem: "tooLong" });
  if (form.referenceNumber.trim().length > 160) problems.push({ field: "referenceNumber", problem: "tooLong" });
  if (form.paymentMode === "paid_now") {
    const account = ctx.cashAccounts?.find((entry) => entry.id === form.cashAccountId);
    if (!form.cashAccountId || !account) problems.push({ field: "cashAccountId", problem: "required" });
    else if (!account.is_active) problems.push({ field: "cashAccountId", problem: "inactive" });
    else if (account.currency_code !== form.currency) problems.push({ field: "cashAccountId", problem: "currency" });
  }
  return problems;
}

/** The POST /admin/expenses body for a valid form (validateExpense found nothing). */
export function expenseBody(form: ExpenseForm, precision: number, today: string): ExpenseCreateInput {
  const amount = parseAmount(form.amount, precision);
  const backdated = form.documentDate < today && form.backdateReason.trim().length >= 3;
  return {
    category_id: form.categoryId,
    amount: amount.ok ? amount.value : form.amount.trim(),
    currency_code: form.currency,
    payment_mode: form.paymentMode,
    ...(form.paymentMode === "paid_now" ? { cash_account_id: form.cashAccountId } : {}),
    ...(form.payeeKind === "supplier" ? { supplier_id: form.supplierId } : { payee: form.payee.trim() }),
    description: form.description.trim(),
    ...(form.referenceNumber.trim() ? { reference_number: form.referenceNumber.trim() } : {}),
    ...(form.receiptId ? { receipt_media_id: form.receiptId } : {}),
    document_date: form.documentDate,
    ...(backdated ? { backdate_reason: form.backdateReason.trim() } : {}),
  };
}

/** The cash accounts a paid-now expense in `currency` can come from. */
export function accountsFor(currency: string, accounts: readonly CashAccountChoice[]): CashAccountChoice[] {
  return accounts.filter((account) => account.is_active && account.currency_code === currency);
}

/* ------------------------------------------------------------------- list */

export const EXPENSE_SORT_KEYS = ["document_date", "amount", "created_at", "payee", "document_number"] as const;
export type ExpenseSort = (typeof EXPENSE_SORT_KEYS)[number];
/** The search box is ?q= (the API's `search`). */
export const EXPENSE_FILTER_KEYS = ["from", "to", "category_id", "status", "cash_account_id", "payee", "unpaid_only"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The list URL's filters as API parameters, for the page and, without paging and status, the totals. */
export function expenseQueries(input: {
  filters: Record<string, string | undefined>;
  q: string;
  page: number;
  perPage: number;
  sort: ExpenseSort;
  dir: "asc" | "desc";
}) {
  const { filters } = input;
  const from = filters.from && DAY.test(filters.from) ? filters.from : undefined;
  const to = filters.to && DAY.test(filters.to) ? filters.to : undefined;
  const inverted = Boolean(from && to && from > to);
  const status = (EXPENSE_STATUSES as readonly string[]).includes(filters.status ?? "") ? (filters.status as ExpenseStatus) : undefined;
  const shared = {
    ...(inverted ? {} : { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    ...(filters.category_id && UUID.test(filters.category_id) ? { category_id: filters.category_id } : {}),
    ...(filters.cash_account_id && UUID.test(filters.cash_account_id) ? { cash_account_id: filters.cash_account_id } : {}),
    ...(filters.payee?.trim() ? { payee: filters.payee.trim().slice(0, 200) } : {}),
    ...(filters.unpaid_only === "true" ? { unpaid_only: true } : {}),
    ...(input.q.trim() ? { search: input.q.trim().slice(0, 200) } : {}),
  };
  return {
    list: { ...shared, ...(status ? { status } : {}), page: input.page, per_page: input.perPage, sort: input.sort, direction: input.dir },
    // Totals cover posted expenses only (the API's rule), so no status filter.
    totals: shared,
    ignoredDates: inverted,
  };
}

export function expenseHref(id: string): string {
  return `/expenses/${encodeURIComponent(id)}`;
}

/** A receipt's bytes through the admin's own route (the browser holds no token). */
export function receiptHref(id: string, download = false): string {
  return `/api/expense-receipts/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}

/* -------------------------------------------------------------- categories */

export type CategoryProblem = "required" | "tooLong";

export function categoryNameProblems(names: { ar: string; en: string }): { ar?: CategoryProblem; en?: CategoryProblem } {
  const check = (value: string): CategoryProblem | undefined =>
    !value.trim() ? "required" : value.trim().length > 160 ? "tooLong" : undefined;
  const problems: { ar?: CategoryProblem; en?: CategoryProblem } = {};
  const ar = check(names.ar);
  const en = check(names.en);
  if (ar) problems.ar = ar;
  if (en) problems.en = en;
  return problems;
}

/** The distinct expense accounts the categories already map to, for reusing one. */
export function mappedAccounts(categories: readonly ExpenseCategory[]): Array<ExpenseCategory["ledger_account"]> {
  const seen = new Map<string, ExpenseCategory["ledger_account"]>();
  for (const category of categories) {
    if (category.ledger_account?.type === "expense") seen.set(category.ledger_account.id, category.ledger_account);
  }
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/* --------------------------------------------------------------- refusals */

/** Every code the expense routes declare (x-error-codes), each with its own message. */
export const EXPENSE_REFUSAL_CODES = [
  "EXPENSE_IDEMPOTENCY_KEY_REQUIRED",
  "EXPENSE_IDEMPOTENCY_KEY_INVALID",
  "EXPENSE_NOT_FOUND",
  "EXPENSE_CATEGORY_NOT_FOUND",
  "EXPENSE_CATEGORY_INACTIVE",
  "EXPENSE_CATEGORY_IN_USE",
  "EXPENSE_LEDGER_ACCOUNT_INVALID",
  "EXPENSE_CURRENCY_DISABLED",
  "EXCHANGE_RATE_NOT_FOUND",
  "EXPENSE_AMOUNT_INVALID",
  "EXPENSE_AMOUNT_PRECISION",
  "EXPENSE_PAYEE_REQUIRED",
  "EXPENSE_SUPPLIER_NOT_FOUND",
  "EXPENSE_CASH_ACCOUNT_REQUIRED",
  "EXPENSE_CASH_ACCOUNT_NOT_ALLOWED",
  "EXPENSE_CASH_ACCOUNT_NOT_FOUND",
  "EXPENSE_CASH_ACCOUNT_INACTIVE",
  "EXPENSE_CASH_ACCOUNT_CURRENCY_MISMATCH",
  "EXPENSE_PERIOD_CLOSED",
  "EXPENSE_BACKDATE_WINDOW",
  "EXPENSE_RECEIPT_INVALID",
  "EXPENSE_ALREADY_POSTED",
  "EXPENSE_INVALID_STATE",
  "EXPENSE_SELF_APPROVAL_FORBIDDEN",
  "EXPENSE_OVERPAYMENT",
  "PERIOD_CLOSED",
] as const;

export type ExpenseRefusalCode = (typeof EXPENSE_REFUSAL_CODES)[number];

export function expenseRefusal(error: unknown): ExpenseRefusalCode | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  return (EXPENSE_REFUSAL_CODES as readonly string[]).includes(error.code) ? (error.code as ExpenseRefusalCode) : null;
}

/** A fresh Idempotency-Key, of the contract's shape. */
export function newIdempotencyKey(): string {
  return `exp-${crypto.randomUUID()}`;
}
