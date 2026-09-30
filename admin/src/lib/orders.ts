import type { components } from "@/types/api";

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
  | "cancel";

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
};

/** The moves the order's current status allows, in the order they are shown. */
const BY_STATUS: Partial<Record<OrderStatus, readonly OrderAction[]>> = {
  pending: ["accept", "reject", "cancel"],
  confirmed: ["prepare", "cancel"],
  preparing: ["markReady", "cancel"],
  ready_for_dispatch: ["dispatch", "cancel"],
};

/** A reason is required (and audited) for these. */
export const REASON_ACTIONS: ReadonlySet<OrderAction> = new Set([
  "reject",
  "cancel",
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
    // The API refuses to cancel a paid COD order.
    if (REASON_ACTIONS.has(action) && isPaid(order)) return false;
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
