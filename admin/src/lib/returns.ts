import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import { normalizeDigits } from "@/lib/number";

/* ---------------------------------------------------------------------------
 * Customer returns v2 (contract 17.0.0, phase 9): a customer (or staff for
 * them) requests a return; staff then approve the quantities, receive the
 * goods, inspect each line into a location, and pay the refund. Each step is
 * its own posting with an operation id, decided by the API — this module only
 * says which step is next, who may take it, and whether a form is complete.
 * Pure, so the unit tests cover it.
 * ------------------------------------------------------------------------- */

export type Return = components["schemas"]["Return"];
export type ReturnItem = components["schemas"]["ReturnItem"];
export type ReturnEvent = components["schemas"]["ReturnEvent"];
export type ReturnStatus = Return["status"];
export type ReturnCondition = NonNullable<ReturnItem["condition"]>;
export type RefundMethod = components["schemas"]["ReturnRefund"]["method"];

export const RETURN_STATUSES = [
  "requested",
  "approved",
  "partially_approved",
  "rejected",
  "received",
  "inspected",
  "refunded",
  "completed",
] as const satisfies readonly ReturnStatus[];

export const RETURN_CONDITIONS = ["sellable", "opened", "damaged", "expired"] as const satisfies readonly ReturnCondition[];
export const REFUND_METHODS = ["cash_account", "delivery_custody"] as const satisfies readonly RefundMethod[];

/* ----------------------------------------------------------------- steps */

export type ReturnAction = "approve" | "receive" | "inspect" | "refund";
export const RETURN_ACTIONS = ["approve", "receive", "inspect", "refund"] as const satisfies readonly ReturnAction[];

/** The permission each step is posted with (x-permission in the contract). */
export const ACTION_PERMISSION: Record<ReturnAction, string> = {
  approve: "returns.approve",
  receive: "returns.receive",
  inspect: "returns.inspect",
  refund: "returns.refund",
};

/** A delivery-fee refund other than the policy's needs this as well. */
export const DELIVERY_FEE_EXCEPTION_PERMISSION = "returns.refund_delivery_fee";

/** The step a return waits for, or null when it is finished (rejected, refunded). */
export function nextAction(status: ReturnStatus): ReturnAction | null {
  switch (status) {
    case "requested":
      return "approve";
    case "approved":
    case "partially_approved":
      return "receive";
    case "received":
      return "inspect";
    case "inspected":
      return "refund";
    default:
      return null;
  }
}

export type StepState = "done" | "current" | "upcoming" | "skipped";

/**
 * The four steps with their state, for the step bar. A rejection ends the
 * flow at the first step: the rest are skipped, not pending.
 */
export function stepStates(status: ReturnStatus): Array<{ action: ReturnAction; state: StepState }> {
  if (status === "rejected") {
    return RETURN_ACTIONS.map((action, index) => ({ action, state: index === 0 ? "done" : "skipped" }));
  }
  const next = nextAction(status);
  const reached = next === null ? RETURN_ACTIONS.length : RETURN_ACTIONS.indexOf(next);
  return RETURN_ACTIONS.map((action, index) => ({
    action,
    state: index < reached ? "done" : index === reached ? "current" : "upcoming",
  }));
}

/** The step shown to this person: the next one, if they hold its permission. */
export function availableAction(status: ReturnStatus, permissions: readonly string[]): ReturnAction | null {
  const next = nextAction(status);
  return next && permissions.includes(ACTION_PERMISSION[next]) ? next : null;
}

/* ------------------------------------------------------------- quantities */

/**
 * Quantities are exact to the thousandth (multipleOf 0.001 in the contract),
 * so they are compared as integer thousandths: 0.1 + 0.2 is never 0.30000004.
 */
export function toMilli(value: number): number {
  return Math.round(value * 1000);
}

export function fromMilli(milli: number): number {
  return milli / 1000;
}

export type QuantityProblem = "required" | "invalid" | "negative" | "whole" | "precision" | "exceeds";

/**
 * A typed quantity for a line. Piece SKUs (whole_units_only) take whole
 * numbers; weighed or measured ones up to three decimals of their base unit.
 * Arabic-Indic digits and a comma decimal are accepted, as people type them.
 */
export function parseQuantity(
  text: string,
  rule: { wholeUnitsOnly: boolean; max: number; allowZero?: boolean },
): { ok: true; value: number } | { ok: false; problem: QuantityProblem } {
  const cleaned = normalizeDigits(text).trim().replace(/[٫,]/g, ".");
  if (cleaned === "") return { ok: false, problem: "required" };
  if (cleaned.startsWith("-")) return { ok: false, problem: "negative" };
  if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(cleaned)) return { ok: false, problem: "invalid" };
  const decimals = cleaned.includes(".") ? cleaned.split(".")[1].replace(/0+$/, "").length : 0;
  if (rule.wholeUnitsOnly && decimals > 0) return { ok: false, problem: "whole" };
  if (decimals > 3) return { ok: false, problem: "precision" };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, problem: "invalid" };
  if (value === 0 && !rule.allowZero) return { ok: false, problem: "required" };
  if (toMilli(value) > toMilli(rule.max)) return { ok: false, problem: "exceeds" };
  return { ok: true, value: fromMilli(toMilli(value)) };
}

/** "2" for pieces, "0.25 kg" for a weighed line: quantity with its base unit. */
export function quantityText(value: number, item: Pick<ReturnItem, "base_unit" | "whole_units_only">): string {
  const number = item.whole_units_only ? String(Math.round(value)) : String(fromMilli(toMilli(value)));
  return item.whole_units_only && item.base_unit === "piece" ? number : `${number} ${item.base_unit}`;
}

/* ---------------------------------------------------------------- approve */

export type ApprovalProblem = { itemId: string; problem: QuantityProblem } | { itemId: null; problem: "empty" | "noteRequired" | "feeReason" | "feeInvalid" };

export interface ApprovalForm {
  decision: "approve" | "reject";
  /** Typed approved quantity per return line. */
  quantities: Record<string, string>;
  note: string;
  /** Only with returns.refund_delivery_fee: refund a fee other than the policy's. */
  feeOverride: boolean;
  feeAmount: string;
  feeReason: string;
}

export function approvalBody(
  ret: Pick<Return, "items">,
  form: ApprovalForm,
):
  | {
      ok: true;
      body: {
        decision: "approve" | "reject";
        note?: string;
        items?: Array<{ return_item_id: string; approved_quantity: number }>;
        delivery_fee_refund?: number;
        delivery_fee_refund_reason?: string;
      };
    }
  | { ok: false; problems: ApprovalProblem[] } {
  const note = form.note.trim();
  if (form.decision === "reject") {
    // A whole rejection carries no lines, and must say why (3+ characters).
    return note.length >= 3 ? { ok: true, body: { decision: "reject", note } } : { ok: false, problems: [{ itemId: null, problem: "noteRequired" }] };
  }
  const problems: ApprovalProblem[] = [];
  const items: Array<{ return_item_id: string; approved_quantity: number }> = [];
  for (const item of ret.items) {
    const typed = form.quantities[item.id] ?? String(item.quantity);
    const parsed = parseQuantity(typed, { wholeUnitsOnly: item.whole_units_only, max: item.quantity, allowZero: true });
    if (!parsed.ok) problems.push({ itemId: item.id, problem: parsed.problem });
    else items.push({ return_item_id: item.id, approved_quantity: parsed.value });
  }
  if (!problems.length && items.every((line) => line.approved_quantity === 0)) problems.push({ itemId: null, problem: "empty" });
  let fee: number | undefined;
  if (form.feeOverride) {
    const amount = normalizeDigits(form.feeAmount).trim();
    // IQD has no minor unit: a whole number of dinars.
    if (!/^\d+$/.test(amount)) problems.push({ itemId: null, problem: "feeInvalid" });
    else fee = Number(amount);
    if (form.feeReason.trim().length < 3) problems.push({ itemId: null, problem: "feeReason" });
  }
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    body: {
      decision: "approve",
      items,
      ...(note.length >= 3 ? { note } : {}),
      ...(fee !== undefined ? { delivery_fee_refund: fee, delivery_fee_refund_reason: form.feeReason.trim() } : {}),
    },
  };
}

/* ---------------------------------------------------------------- inspect */

export interface InspectChoice {
  condition: ReturnCondition | "";
  locationId: string;
}

export interface InspectLocation {
  id: string;
  sellable: boolean;
  active: boolean;
}

/** Sellable goods go to a sellable location; opened, damaged or expired ones to a non-sellable one. */
export function locationFits(condition: ReturnCondition, location: Pick<InspectLocation, "sellable">): boolean {
  return condition === "sellable" ? location.sellable : !location.sellable;
}

/** The active locations a line in this condition may go to. */
export function locationsFor<L extends InspectLocation>(condition: ReturnCondition | "", locations: readonly L[]): L[] {
  if (!condition) return [];
  return locations.filter((location) => location.active && locationFits(condition, location));
}

/** Only approved lines are inspected (a line approved at 0 is not). */
export function inspectedLines(ret: Pick<Return, "items">): ReturnItem[] {
  return ret.items.filter((item) => toMilli(item.approved_quantity) > 0);
}

export type InspectProblem = { itemId: string; problem: "condition" | "location" | "mismatch" };

export function inspectionBody(
  ret: Pick<Return, "items">,
  choices: Record<string, InspectChoice>,
  locations: readonly InspectLocation[],
):
  | { ok: true; body: { items: Array<{ return_item_id: string; condition: ReturnCondition; location_id: string }> } }
  | { ok: false; problems: InspectProblem[] } {
  const problems: InspectProblem[] = [];
  const items: Array<{ return_item_id: string; condition: ReturnCondition; location_id: string }> = [];
  for (const item of inspectedLines(ret)) {
    const choice = choices[item.id];
    if (!choice?.condition) {
      problems.push({ itemId: item.id, problem: "condition" });
      continue;
    }
    const location = locations.find((entry) => entry.id === choice.locationId);
    if (!location || !location.active) {
      problems.push({ itemId: item.id, problem: "location" });
      continue;
    }
    if (!locationFits(choice.condition, location)) {
      problems.push({ itemId: item.id, problem: "mismatch" });
      continue;
    }
    items.push({ return_item_id: item.id, condition: choice.condition, location_id: location.id });
  }
  return problems.length ? { ok: false, problems } : { ok: true, body: { items } };
}

/* ----------------------------------------------------------------- refund */

export interface RefundForm {
  method: RefundMethod;
  cashAccountId: string;
  collectionId: string;
  proofReference: string;
}

export type RefundProblem = "cashAccount" | "collection" | "proof";

/**
 * The refund body. Nothing to pay (the whole refund was offset against an
 * amount the customer never paid) still records the step, with no source.
 */
export function refundBody(
  ret: Pick<Return, "cash_refund_amount">,
  form: RefundForm,
):
  | { ok: true; body: { method: RefundMethod; cash_account_id?: string; collection_id?: string; proof_reference?: string } }
  | { ok: false; problems: RefundProblem[] } {
  if (ret.cash_refund_amount <= 0) return { ok: true, body: { method: "cash_account" } };
  if (form.method === "cash_account") {
    return form.cashAccountId ? { ok: true, body: { method: "cash_account", cash_account_id: form.cashAccountId } } : { ok: false, problems: ["cashAccount"] };
  }
  const problems: RefundProblem[] = [];
  if (!form.collectionId) problems.push("collection");
  if (!form.proofReference.trim()) problems.push("proof");
  return problems.length
    ? { ok: false, problems }
    : { ok: true, body: { method: "delivery_custody", collection_id: form.collectionId, proof_reference: form.proofReference.trim() } };
}

/* --------------------------------------------------------------- refusals */

/**
 * The API's declared refusals on the return routes (x-error-codes), each
 * with its own sentence in the messages (returns.refusals.<code>).
 */
export const RETURN_REFUSAL_CODES = [
  "RETURN_INVALID_STATE",
  "RETURN_REJECTION_HAS_LINES",
  "RETURN_REJECTION_REASON_REQUIRED",
  "RETURN_APPROVAL_INCOMPLETE",
  "RETURN_APPROVAL_EXCEEDS_REQUEST",
  "RETURN_APPROVAL_EMPTY",
  "RETURN_DELIVERY_FEE_PERMISSION_REQUIRED",
  "RETURN_DELIVERY_FEE_REASON_REQUIRED",
  "RETURN_DELIVERY_FEE_EXCEEDS_CHARGED",
  "RETURN_INSPECTION_INCOMPLETE",
  "RETURN_LOCATION_UNAVAILABLE",
  "RETURN_LOCATION_CONDITION_MISMATCH",
  "RETURN_EXCEEDS_ISSUED_QUANTITY",
  "INVENTORY_COST_NEGATIVE",
  "RETURN_REFUND_METHOD_FIELDS_INVALID",
  "RETURN_CUSTODY_REFUND_PROOF_REQUIRED",
  "RETURN_CASH_ACCOUNT_UNAVAILABLE",
  "RETURN_COLLECTION_UNAVAILABLE",
  "RETURN_REFUND_EXCEEDS_CUSTODY",
  "RETURN_REFUND_EXCEEDS_PAID",
  "SKU_WHOLE_UNITS_ONLY",
  "RETURN_QUANTITY_PRECISION",
  "SEPARATION_OF_DUTIES_VIOLATION",
  "PERIOD_CLOSED",
] as const;

export type ReturnRefusalCode = (typeof RETURN_REFUSAL_CODES)[number];

export function returnRefusal(error: unknown): ReturnRefusalCode | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  return (RETURN_REFUSAL_CODES as readonly string[]).includes(error.code) ? (error.code as ReturnRefusalCode) : null;
}

/* ------------------------------------------------------------------ list */

export const RETURN_SORT_KEYS = ["date", "number", "refund"] as const;
export type ReturnSort = (typeof RETURN_SORT_KEYS)[number];
/** The search box (?q=) takes an order NUMBER; the page turns it into an order id. */
export const RETURN_FILTER_KEYS = ["status", "date_from", "date_to"] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The list URL's filters as queue parameters; an inverted date range is not sent. */
export function returnListQuery(input: {
  filters: Record<string, string | undefined>;
  page: number;
  perPage: number;
  sort: ReturnSort;
  dir: "asc" | "desc";
  orderId?: string | null;
}) {
  const { filters } = input;
  const from = filters.date_from && DAY.test(filters.date_from) ? filters.date_from : undefined;
  const to = filters.date_to && DAY.test(filters.date_to) ? filters.date_to : undefined;
  const inverted = Boolean(from && to && from > to);
  const status = (RETURN_STATUSES as readonly string[]).includes(filters.status ?? "") ? (filters.status as ReturnStatus) : undefined;
  return {
    query: {
      page: input.page,
      per_page: input.perPage,
      sort_by: input.sort,
      sort_direction: input.dir,
      ...(status ? { status } : {}),
      ...(input.orderId ? { order_id: input.orderId } : {}),
      ...(inverted ? {} : { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) }),
    },
    ignoredDates: inverted,
  };
}

/** The typed order number, cleaned (Latin digits, no spaces), or null. */
export function orderNumberFilter(raw: string | undefined): string | null {
  const text = normalizeDigits(raw ?? "").trim().replace(/\s+/g, "");
  return text ? text.slice(0, 40) : null;
}

export function returnHref(id: string): string {
  return `/returns/${encodeURIComponent(id)}`;
}

/** Who did a step: the customer (their own request) or staff. */
export function eventActor(event: Pick<ReturnEvent, "actor_id">, ret: Pick<Return, "user_id">): "customer" | "staff" {
  return event.actor_id === ret.user_id ? "customer" : "staff";
}
