import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";

/* ---------------------------------------------------------------------------
 * Order operations: which buttons a staff member sees on an order.
 *
 * A button shows only when BOTH hold: the staff member's CURRENT permissions
 * include what the API checks for that move, and the order's current state
 * allows it (the server's own transition table, api/openapi.yaml). The API
 * enforces both regardless — this only keeps the page from offering moves
 * that would be refused. Pure, so it is unit-tested on its own.
 * ------------------------------------------------------------------------- */

export type AdminOrder = components["schemas"]["AdminOrder"];
export type AdminOrderPage = components["schemas"]["AdminOrderPage"];
export type OrderStatus = components["schemas"]["OrderStatus"];

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
  "failed",
  "cancelled",
  "rejected",
  "return_requested",
  "returned",
];

export type OrderAction =
  | "accept"
  | "reject"
  | "prepare"
  | "markReady"
  | "dispatch"
  | "cancel"
  | "deliver"
  | "fail"
  | "retry";

/**
 * PATCH /admin/deliveries/{id}/status moves (API 10.0), by the delivery
 * status each one sets: a dispatched order is delivered or fails; a failed
 * one is retried on the same custody (no second stock issue).
 */
export const DELIVERY_MOVES = {
  deliver: "delivered",
  fail: "failed",
  retry: "out_for_delivery",
} as const satisfies Partial<Record<OrderAction, string>>;

/** PATCH /admin/orders/{id}/status moves, by the status each one sets. */
export const STATUS_MOVES = {
  accept: "confirmed",
  prepare: "preparing",
  markReady: "ready_for_dispatch",
  dispatch: "dispatched",
} as const satisfies Partial<Record<OrderAction, OrderStatus>>;

/**
 * Every permission a move needs. The status moves need the key the API maps
 * from the target status (`x-permission-by-status`).
 *
 * Reject (contract 8.0, #65) is its own route and status — pending orders
 * only, `orders.reject`, reason required — and never a cancellation, so the
 * reports can tell a store's refusal from a cancelled order.
 */
export const ACTION_PERMISSIONS: Record<OrderAction, readonly string[]> = {
  accept: ["orders.accept"],
  reject: ["orders.reject"],
  prepare: ["orders.prepare"],
  markReady: ["orders.mark_ready"],
  dispatch: ["orders.handover"],
  cancel: ["orders.cancel"],
  deliver: ["orders.deliver"],
  fail: ["orders.fail"],
  retry: ["orders.retry"],
};

/** The moves the order's current status allows, in the order they are shown. */
const BY_STATUS: Partial<Record<OrderStatus, readonly OrderAction[]>> = {
  pending: ["accept", "reject", "cancel"],
  confirmed: ["prepare", "cancel"],
  preparing: ["markReady", "cancel"],
  ready_for_dispatch: ["dispatch", "cancel"],
  dispatched: ["deliver", "fail"],
  failed: ["retry"],
};

/** A reason is required (and audited) for these. */
export const REASON_ACTIONS: ReadonlySet<OrderAction> = new Set([
  "reject",
  "cancel",
  "fail",
]);

function isPaid(order: Pick<AdminOrder, "payments">): boolean {
  return (order.payments ?? []).some((payment) => payment.status === "paid");
}

export function availableActions(
  order: Pick<AdminOrder, "status" | "payments">,
  permissions: readonly string[],
): OrderAction[] {
  const granted = new Set(permissions);
  return (BY_STATUS[order.status as OrderStatus] ?? []).filter((action) => {
    if (!ACTION_PERMISSIONS[action].every((key) => granted.has(key))) {
      return false;
    }
    // The API refuses to cancel or reject a paid COD order.
    if ((action === "cancel" || action === "reject") && isPaid(order)) return false;
    return true;
  });
}

export type DispatchBlocker = "noDelivery" | "noAgent" | "deliveryNotAssigned";

/**
 * Why a handover would be refused even with the permission: the API needs the
 * order's current delivery to have an agent and still be `assigned`.
 */
export function dispatchBlocker(
  order: Pick<AdminOrder, "delivery">,
): DispatchBlocker | null {
  const delivery = order.delivery;
  if (!delivery) return "noDelivery";
  if (!delivery.agent) return "noAgent";
  if (delivery.status !== "assigned") return "deliveryNotAssigned";
  return null;
}

/**
 * PATCH /deliveries/{id}/assign: an active delivery (assigned or out for
 * delivery) on an order that has not finished.
 */
export function canAssignAgent(
  order: Pick<AdminOrder, "status" | "delivery">,
  permissions: readonly string[],
): boolean {
  if (!permissions.includes("orders.assign_agent")) return false;
  const delivery = order.delivery;
  if (!delivery?.id) return false;
  if (!["assigned", "out_for_delivery"].includes(delivery.status ?? "")) {
    return false;
  }
  return [
    "pending",
    "confirmed",
    "preparing",
    "ready_for_dispatch",
    "dispatched",
  ].includes(order.status as string);
}

/* ------------------------------------------------------------------ list */

export interface OrderListQuery {
  status?: OrderStatus;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  per_page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The URL's table state as GET /admin/orders parameters. Anything the API
 * would refuse with a 422 (an unknown status, a malformed day, an inverted
 * range) is dropped here instead, and reported so the page can say so.
 */
export function orderListQuery(input: {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  perPage: number;
}): { query: OrderListQuery; invalidRange: boolean } {
  const status = ORDER_STATUSES.includes(input.status as OrderStatus)
    ? (input.status as OrderStatus)
    : undefined;
  let from = input.from && DAY.test(input.from) ? input.from : undefined;
  let to = input.to && DAY.test(input.to) ? input.to : undefined;
  const invalidRange = Boolean(from && to && from > to);
  if (invalidRange) {
    from = undefined;
    to = undefined;
  }
  const q = input.q?.trim().slice(0, 40) || undefined;
  return {
    query: { status, q, from, to, page: input.page, per_page: input.perPage },
    invalidRange,
  };
}

/** Amounts arrive as numbers in the store currency from GET /settings. */
export function formatMoney(
  amount: number | null | undefined,
  currency: string,
  locale: string,
): string {
  const value = Number(amount ?? 0);
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: currency === "IQD" ? 0 : 2,
    numberingSystem: "latn",
  }).format(value);
  return `${number} ${currency}`;
}

/* ---------------------------------------------------------- notifications */

/**
 * Where a notification opens in the admin. Staff links name the admin order
 * page; the same person's own customer notifications (their inbox is shared
 * with their phone) point at /orders/{id}, which here is that order too.
 */
export function adminInboxHref(deepLink: string): string {
  const match = /^\/(?:admin\/)?orders\/([0-9a-fA-F-]{36})$/.exec(deepLink);
  return match ? `/orders/${match[1]}` : "/notifications";
}

/* ------------------------------------------------------- lifecycle v2 */

/**
 * The refusals API 10.0 sends, and what each carries.
 *
 * - 409 STALE_ORDER_STATE: someone acted first; `current_status` and
 *   `current_version` say where the order is now.
 * - 403 BELOW_COST_BLOCKED: a confirmation (or price publish) would sell
 *   below the protected threshold; one field error per SKU, with the cost
 *   and minimum price only for cost.view.
 * - 403 "... cannot approve their own below-cost exception": separation of
 *   duties refused a self-approval.
 * - 409 ORDER_NEEDS_ATTENTION: shortages must be resolved before "ready".
 */
export function staleState(error: unknown): { status: OrderStatus; version: number } | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "STALE_ORDER_STATE") return null;
  const detail = error.errors.find((row) => row.current_status);
  return detail?.current_status && detail.current_version
    ? { status: detail.current_status, version: detail.current_version }
    : null;
}

export interface BelowCostBreach {
  variantId: string | null;
  sku: string;
  price: number | null;
  thresholdPercent: number | null;
  /** Present only with cost.view. */
  cost: number | null;
  minimumPrice: number | null;
}

export function belowCostBreaches(error: unknown): BelowCostBreach[] | null {
  if (!(error instanceof ApiError) || error.code !== "BELOW_COST_BLOCKED") return null;
  return error.errors
    .filter((row) => row.code === "BELOW_COST_BLOCKED")
    .map((row) => ({
      variantId: row.field?.startsWith("variant.") ? row.field.slice("variant.".length) : null,
      sku: row.sku ?? "",
      price: row.price ?? null,
      thresholdPercent: row.threshold_percent ?? null,
      cost: row.cost ?? null,
      minimumPrice: row.minimum_price ?? null,
    }));
}

export function isSelfApprovalRefused(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && /cannot approve their own/i.test(error.message);
}

export function needsAttentionRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.code === "ORDER_NEEDS_ATTENTION";
}

export interface ShortLine {
  orderItemId: string;
  variantId: string;
  requested: string;
  allocated: string;
  short: string;
}

export interface ReductionProposal {
  orderItemId: string;
  oldQuantity: number;
  newQuantity: number;
  reason: string;
  status: "pending" | "accepted" | "denied";
}

/** The order's preparation shortages and any reduction awaiting the customer. */
export function attention(order: Pick<AdminOrder, "attention_details">): { shortLines: ShortLine[]; proposal: ReductionProposal | null } {
  const details = (order.attention_details ?? {}) as {
    short_lines?: Array<Record<string, unknown>>;
    reduction_proposal?: Record<string, unknown> | null;
  };
  const shortLines = (details.short_lines ?? []).map((row) => ({
    orderItemId: String(row.order_item_id ?? ""),
    variantId: String(row.variant_id ?? ""),
    requested: String(row.requested ?? "0"),
    allocated: String(row.allocated ?? "0"),
    short: String(row.short ?? "0"),
  }));
  const raw = details.reduction_proposal;
  const status = String(raw?.status ?? "pending");
  const proposal = raw
    ? {
        orderItemId: String(raw.order_item_id ?? ""),
        oldQuantity: Number(raw.old_quantity ?? 0),
        newQuantity: Number(raw.new_quantity ?? 0),
        reason: String(raw.reason ?? ""),
        status: (status === "accepted" || status === "denied" ? status : "pending") as ReductionProposal["status"],
      }
    : null;
  return { shortLines, proposal };
}

/** Shortage actions: a preparing order with shortages and no reduction awaiting the customer. */
export function canResolveShortage(
  order: Pick<AdminOrder, "status" | "inventory_attention_required" | "attention_details">,
  permissions: readonly string[],
): boolean {
  if (!permissions.includes("orders.shortage.resolve")) return false;
  if (order.status !== "preparing" || !order.inventory_attention_required) return false;
  return attention(order).proposal?.status !== "pending";
}

export type CancellationResolution = "approve" | "deny";

/**
 * A pending customer cancellation request can be resolved with
 * orders.cancel_request.resolve; approving it after dispatch (dispatched or
 * failed) also needs orders.cancel_after_dispatch and opens a retrieval.
 */
export function cancellationResolutions(
  order: Pick<AdminOrder, "status" | "cancellation_request">,
  permissions: readonly string[],
): CancellationResolution[] {
  if (order.cancellation_request?.status !== "pending") return [];
  if (!permissions.includes("orders.cancel_request.resolve")) return [];
  const afterDispatch = order.status === "dispatched" || order.status === "failed";
  const canApprove = !afterDispatch || permissions.includes("orders.cancel_after_dispatch");
  return canApprove ? ["approve", "deny"] : ["deny"];
}

/** A failed delivery can be brought back for a retry with retrieval.open. */
export function canOpenRetrieval(
  order: Pick<AdminOrder, "status" | "retrievals">,
  permissions: readonly string[],
): boolean {
  if (!permissions.includes("retrieval.open") || order.status !== "failed") return false;
  return !(order.retrievals ?? []).some((row) => row.status === "open" || row.status === "partially_received");
}

/** Pick lists exist once preparation has started. */
export function hasPickList(order: Pick<AdminOrder, "status">, permissions: readonly string[]): boolean {
  return permissions.includes("inventory.pick") && PICKABLE_STATUSES.includes(order.status as OrderStatus);
}

/* ------------------------------------------------------------ pick lists */

export type PickList = components["schemas"]["PickList"];
export type PickListItem = components["schemas"]["PickListItem"];

export interface PickRow extends PickListItem {
  orderNumber: string;
}

/**
 * Every line of a batch of pick lists in walking order: warehouse, then
 * location (natural order, so A-2 comes before A-10), then product, so one
 * person collects a batch in a single pass.
 */
export function batchPickRows(lists: readonly PickList[], locale = "ar"): PickRow[] {
  const rows = lists.flatMap((list) => (list.items ?? []).map((item) => ({ ...item, orderNumber: list.order_number ?? "" })));
  const name = (row: PickRow) => (locale === "ar" ? row.product_name_ar : row.product_name_en) ?? "";
  return rows.sort(
    (a, b) =>
      (a.warehouse_code ?? "").localeCompare(b.warehouse_code ?? "") ||
      (a.location_code ?? "").localeCompare(b.location_code ?? "", "en", { numeric: true }) ||
      name(a).localeCompare(name(b)) ||
      a.orderNumber.localeCompare(b.orderNumber),
  );
}

/** Orders whose pick lists can be read and printed (preparation has started). */
export const PICKABLE_STATUSES: readonly OrderStatus[] = ["preparing", "ready_for_dispatch", "dispatched", "failed"];
