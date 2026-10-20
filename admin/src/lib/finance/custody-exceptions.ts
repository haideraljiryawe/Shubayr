import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import { fixedText, toFixed } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * Custody exceptions (contract 13.3, phase 8d): goods lost or damaged in a
 * delivery party's custody (borne by the store or the party), goods returned
 * at the door against an order delivered short, and delivery-fee refunds.
 * Each is an immutable numbered document posted once per operation id, and
 * corrected only by a reversal document.
 * ------------------------------------------------------------------------- */

export type CustodyException = components["schemas"]["CustodyException"];
export type ExceptionType = CustodyException["type"];
export type CustodyLine = components["schemas"]["DeliveryPartyCustodyLine"];

export const EXCEPTION_TYPES = ["goods_loss", "return_against_uncollected", "delivery_fee_refund"] as const satisfies readonly ExceptionType[];
export const EXCEPTION_STATUSES = ["active", "reversed"] as const;
export const EXCEPTION_FILTER_KEYS = ["type", "party_id", "order_id", "date_from", "date_to", "status"] as const;

/** The permission each kind of exception is recorded with. */
export const EXCEPTION_PERMISSION: Record<ExceptionType, string> = {
  goods_loss: "custody_exceptions.loss",
  return_against_uncollected: "custody_exceptions.return_uncollected",
  delivery_fee_refund: "custody_exceptions.refund_delivery_fee",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The list URL's filters as API parameters; an inverted date range is not sent. */
export function exceptionListQuery(filters: Record<string, string | undefined>, page: number, perPage: number) {
  const from = filters.date_from && DAY.test(filters.date_from) ? filters.date_from : undefined;
  const to = filters.date_to && DAY.test(filters.date_to) ? filters.date_to : undefined;
  const inverted = Boolean(from && to && from > to);
  const type = (EXCEPTION_TYPES as readonly string[]).includes(filters.type ?? "") ? (filters.type as ExceptionType) : undefined;
  const status = (EXCEPTION_STATUSES as readonly string[]).includes(filters.status ?? "")
    ? (filters.status as (typeof EXCEPTION_STATUSES)[number])
    : undefined;
  return {
    query: {
      page,
      per_page: perPage,
      ...(type ? { type } : {}),
      ...(filters.party_id && UUID.test(filters.party_id) ? { party_id: filters.party_id } : {}),
      ...(filters.order_id && UUID.test(filters.order_id) ? { order_id: filters.order_id } : {}),
      ...(inverted ? {} : { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) }),
      ...(status ? { status } : {}),
    },
    ignoredDates: inverted,
  };
}

export function exceptionHref(id: string): string {
  return `/finance/custody-exceptions/${encodeURIComponent(id)}`;
}

/**
 * The API's refusals of an exception or its reversal, by kind. They share
 * HTTP codes (409, 403, 422), so the kind is read from the error code.
 */
export type ExceptionRefusal =
  | "receiptConsumed"
  | "ownException"
  | "alreadyReversed"
  | "notInCustody"
  | "noParty"
  | "noShortfall"
  | "noUncollected"
  | "feeCap"
  | "notDelivered"
  | "notSold"
  | "notInThisCustody"
  | "overCustody"
  | "noValue"
  | "inactiveAccount"
  | "duplicateHolding"
  | "separation";

/**
 * Refusals by the API's error code — never by its English message (NOTE-012).
 * Both "a party can't act on its own custody" and "strict separation needs
 * another recorder" come as SEPARATION_OF_DUTIES_VIOLATION, so they share
 * the "separation" message until the API tells them apart.
 */
const CODES: Record<string, ExceptionRefusal> = {
  RECEIPT_REVERSAL_REQUIRED: "receiptConsumed",
  SELF_REVERSAL_FORBIDDEN: "ownException",
  SEPARATION_OF_DUTIES_VIOLATION: "separation",
  CUSTODY_EXCEPTION_ALREADY_REVERSED: "alreadyReversed",
  GOODS_NOT_IN_CUSTODY: "notInCustody",
  GOODS_LOSS_STATUS_INVALID: "notInCustody",
  ORDER_HAS_NO_CUSTODY_PARTY: "noParty",
  RETURN_REQUIRES_CONFIRMED_SHORTFALL: "noShortfall",
  RETURN_SHORTFALL_RESOLVED: "noUncollected",
  DELIVERY_FEE_REFUND_EXCEEDS_UNCOLLECTED: "noUncollected",
  DELIVERY_FEE_REFUND_EXCEEDS_CHARGE: "feeCap",
  DELIVERY_REVENUE_NOT_POSTED: "notDelivered",
  RETURN_REQUIRES_SOLD_CUSTODY: "notSold",
  CUSTODY_HOLDING_WRONG_ORDER_OR_PARTY: "notInThisCustody",
  CUSTODY_EXCEPTION_EXCEEDS_GOODS: "overCustody",
  RETURN_HAS_NO_REFUNDABLE_VALUE: "noValue",
  CUSTODY_COST_UNAVAILABLE: "noValue",
  REFUND_REQUIRES_ACTIVE_IQD_ACCOUNT: "inactiveAccount",
  CASH_RECEIPT_REQUIRES_IQD_ACCOUNT: "inactiveAccount",
  CUSTODY_HOLDING_DUPLICATED: "duplicateHolding",
};

export function exceptionRefusal(error: unknown): ExceptionRefusal | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  return CODES[error.code] ?? null;
}

/** An order's open custody lines (what the party still holds for it), by holding. */
export function orderHoldings(lines: readonly CustodyLine[], orderId: string): CustodyLine[] {
  return lines.filter((line) => line.order.id === orderId);
}

/**
 * The quantities typed per holding as API lines; a quantity above what is
 * held, or not a number with up to three decimals, is a problem.
 */
export function holdingLines(holdings: readonly CustodyLine[], typed: Readonly<Record<string, string>>) {
  const lines: Array<{ custody_holding_id: string; quantity: string }> = [];
  const problems: string[] = [];
  for (const holding of holdings) {
    const text = (typed[holding.holding_id] ?? "").trim();
    if (!text) continue;
    if (!/^\d+(\.\d{1,3})?$/.test(text)) {
      problems.push(holding.holding_id);
      continue;
    }
    const value = toFixed(text);
    if (value <= 0n) continue;
    if (value > toFixed(holding.quantity)) problems.push(holding.holding_id);
    lines.push({ custody_holding_id: holding.holding_id, quantity: fixedText(value, 3) });
  }
  return { lines, problems };
}

/** One order item's price and quantity, to value goods coming back. */
export interface PricedItem {
  variantId: string;
  quantity: number;
  lineTotal: number;
}

/**
 * What goods returned at the door are worth: each line's share of its order
 * item's total, as the API computes it (line_total ÷ quantity × returned).
 * Holdings are matched to order items by variant.
 */
export function returnValue(holdings: readonly CustodyLine[], typed: Readonly<Record<string, string>>, items: readonly PricedItem[]): bigint {
  let total = 0n;
  for (const holding of holdings) {
    const text = (typed[holding.holding_id] ?? "").trim();
    if (!/^\d+(\.\d{1,3})?$/.test(text)) continue;
    const item = items.find((entry) => entry.variantId === holding.variant_id);
    if (!item || item.quantity <= 0) continue;
    total += (toFixed(item.lineTotal) * toFixed(text)) / toFixed(item.quantity);
  }
  return total;
}

/**
 * How much of the delivery fee can still be refunded: the fee charged less
 * active refunds already made; and, when netted against the uncollected
 * amount, no more than is still uncollected.
 */
export function refundCap(input: { fee: number; refunded: readonly CustodyException[]; uncollected: number | null; method: "cash_account" | "uncollected" }): bigint {
  const prior = input.refunded
    .filter((row) => row.type === "delivery_fee_refund" && row.status === "active")
    .reduce((sum, row) => sum + toFixed(row.amount_iqd), 0n);
  const left = toFixed(input.fee) - prior;
  const cap = left > 0n ? left : 0n;
  if (input.method === "uncollected") {
    const open = toFixed(input.uncollected ?? 0);
    return open < cap ? open : cap;
  }
  return cap;
}
