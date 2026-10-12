import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import { fixedText, toFixed } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * Cash receipts from delivery parties (contract 13.2, phase 8c).
 *
 * A receipt hands a party's collected IQD cash into a cash account. It can be
 * allocated, in the same posting or later, to the party's confirmed
 * collections that are not settled yet, oldest first, and any remainder stays
 * explicitly unallocated. Every posting carries an operation id, so a double
 * click or a retry replays the first answer instead of posting twice.
 * Amounts are compared exactly (10⁻¹² fixed point), never as floats.
 * ------------------------------------------------------------------------- */

export type CashReceipt = components["schemas"]["CashReceiptVoucher"];
export type CashReceiptBatch = components["schemas"]["CashReceiptAllocationBatch"];
export type Unsettled = components["schemas"]["CashReceiptSuggestions"]["data"][number];

/** Allocation inputs allow the API's six decimals; the receipt itself is whole dinars. */
export const ALLOCATION_DECIMALS = 6;

/** One unsettled collection as the allocation table uses it. */
export interface UnsettledRow {
  orderId: string;
  orderNumber: string;
  unsettled: bigint;
}

export function unsettledRows(rows: readonly Unsettled[]): UnsettledRow[] {
  return rows.map((row) => ({
    orderId: row.order.id,
    orderNumber: row.order.order_number,
    unsettled: toFixed(row.unsettled_amount_iqd),
  }));
}

/**
 * Spread `amount` over the rows in the order given (oldest first), each up to
 * what is still unsettled on it: the same rule as the API's suggestions.
 * Rows that get nothing are left out.
 */
export function autoAllocate(amount: bigint, rows: readonly UnsettledRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  let left = amount > 0n ? amount : 0n;
  for (const row of rows) {
    if (left <= 0n) break;
    const take = row.unsettled < left ? row.unsettled : left;
    if (take > 0n) {
      out[row.orderId] = fixedText(take, ALLOCATION_DECIMALS);
      left -= take;
    }
  }
  return out;
}

export type AllocationProblem =
  | { kind: "amount" }
  | { kind: "overCustody" }
  | { kind: "overRow"; orderNumber: string }
  | { kind: "overAmount" }
  | { kind: "invalidRow"; orderNumber: string };

export interface AllocationPlan {
  /** The amount the allocations draw from: the receipt, or a receipt's remainder. */
  amount: bigint;
  allocated: bigint;
  /** What stays unallocated on the receipt after these allocations. */
  unallocated: bigint;
  lines: Array<{ order_id: string; amount_iqd: string }>;
  problems: AllocationProblem[];
}

/**
 * What a receipt (or a later allocation) would post, checked before anything
 * is sent: the amount is positive and within what the party holds; no order
 * gets more than is unsettled on it; the allocations together stay within
 * the amount. The API enforces all of this too — the page only says it first.
 */
export function allocationPlan(input: {
  amount: string;
  rows: readonly UnsettledRow[];
  applied: Readonly<Record<string, string>>;
  /** The party's cash held, when receiving; absent for a later allocation. */
  cashHeld?: bigint;
}): AllocationPlan {
  const problems: AllocationProblem[] = [];
  const amountText = input.amount.trim();
  const amount = /^\d+(\.\d+)?$/.test(amountText) ? toFixed(amountText) : 0n;
  if (amount <= 0n) problems.push({ kind: "amount" });
  else if (input.cashHeld !== undefined && amount > input.cashHeld) problems.push({ kind: "overCustody" });
  const lines: AllocationPlan["lines"] = [];
  let allocated = 0n;
  for (const row of input.rows) {
    const text = (input.applied[row.orderId] ?? "").trim();
    if (!text) continue;
    if (!/^\d+(\.\d{1,6})?$/.test(text)) {
      problems.push({ kind: "invalidRow", orderNumber: row.orderNumber });
      continue;
    }
    const value = toFixed(text);
    if (value <= 0n) continue;
    if (value > row.unsettled) problems.push({ kind: "overRow", orderNumber: row.orderNumber });
    allocated += value;
    lines.push({ order_id: row.orderId, amount_iqd: fixedText(value, ALLOCATION_DECIMALS) });
  }
  if (amount > 0n && allocated > amount) problems.push({ kind: "overAmount" });
  return { amount, allocated, unallocated: amount > allocated ? amount - allocated : 0n, lines, problems };
}

/**
 * The API's refusals of a receipt, an allocation or a reversal, by kind.
 * Contract 14 gives every refusal a stable code, so localized clients never
 * need to inspect English server messages.
 */
export type ReceiptRefusal =
  | "overAllocation"
  | "wrongParty"
  | "moreThanCollected"
  | "notConfirmed"
  | "duplicateOrder"
  | "overCustody"
  | "ownReceipt"
  | "ownCustody"
  | "strictAllocation"
  | "alreadyReversed"
  | "reversedReceipt"
  | "inactiveParty"
  | "inactiveAccount"
  | "collectionNotFound";

const REFUSALS: Record<string, ReceiptRefusal> = {
  ALLOCATION_EXCEEDS_RECEIPT: "overAllocation",
  ALLOCATION_WRONG_PARTY: "wrongParty",
  ALLOCATION_EXCEEDS_COLLECTED: "moreThanCollected",
  ORDER_ALREADY_RECEIPTED: "moreThanCollected",
  ALLOCATION_COLLECTION_UNCONFIRMED: "notConfirmed",
  ALLOCATION_ORDER_DUPLICATED: "duplicateOrder",
  RECEIPT_EXCEEDS_CASH_CUSTODY: "overCustody",
  SELF_REVERSAL_FORBIDDEN: "ownReceipt",
  SELF_CUSTODY_CASH_ACTION_FORBIDDEN: "ownCustody",
  SEPARATION_OF_DUTIES_VIOLATION: "strictAllocation",
  RECEIPT_REVERSAL_ALREADY_REVERSED: "alreadyReversed",
  RECEIPT_ALLOCATION_REVERSED: "reversedReceipt",
  DELIVERY_PARTY_INACTIVE: "inactiveParty",
  CASH_ACCOUNT_INACTIVE: "inactiveAccount",
  ALLOCATION_COLLECTION_NOT_FOUND: "collectionNotFound",
};

export function receiptRefusal(error: unknown): ReceiptRefusal | null {
  if (!(error instanceof ApiError)) return null;
  return error.code ? (REFUSALS[error.code] ?? null) : null;
}

/**
 * One operation id per exact request. The same request (a double click, a
 * retry after a lost answer) keeps its id, so the API replays the first
 * answer; a different request gets a new one, since the API refuses an id
 * reused with a different body. After a success, `reset` makes even an
 * identical next request a new posting.
 */
export class OperationKey {
  private last: { signature: string; id: string } | null = null;

  constructor(private readonly newId: () => string = () => `op-${crypto.randomUUID()}`) {}

  id(signature: string): string {
    if (!this.last || this.last.signature !== signature) this.last = { signature, id: this.newId() };
    return this.last.id;
  }

  reset(): void {
    this.last = null;
  }
}

/* --------------------------------------------------------------- lists */

export const RECEIPT_STATUSES = ["active", "reversed"] as const;
export const RECEIPT_FILTER_KEYS = ["party_id", "cash_account_id", "date_from", "date_to", "status"] as const;
export const UNALLOCATED_FILTER_KEYS = ["party_id", "cash_account_id", "date_from", "date_to"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A receipt list's URL filters as API parameters. Malformed values are
 * dropped; an inverted date range (the API answers 422) is not sent, and
 * `ignored` says so for the page to explain.
 */
export function receiptListQuery(filters: Record<string, string | undefined>, page: number, perPage: number) {
  const from = filters.date_from && DAY.test(filters.date_from) ? filters.date_from : undefined;
  const to = filters.date_to && DAY.test(filters.date_to) ? filters.date_to : undefined;
  const inverted = Boolean(from && to && from > to);
  const status = (RECEIPT_STATUSES as readonly string[]).includes(filters.status ?? "")
    ? (filters.status as (typeof RECEIPT_STATUSES)[number])
    : undefined;
  return {
    query: {
      page,
      per_page: perPage,
      ...(filters.party_id && UUID.test(filters.party_id) ? { party_id: filters.party_id } : {}),
      ...(filters.cash_account_id && UUID.test(filters.cash_account_id) ? { cash_account_id: filters.cash_account_id } : {}),
      ...(inverted ? {} : { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) }),
      ...(status ? { status } : {}),
    },
    ignoredDates: inverted,
  };
}

export function receiptHref(id: string): string {
  return `/finance/cash-receipts/${encodeURIComponent(id)}`;
}
