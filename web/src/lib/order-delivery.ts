import type { Order, OrderStatus } from "./api";

/* ---------------------------------------------------------------------------
 * The delivery behind an order, as a customer is allowed to see it.
 *
 * `Order.delivery_id` is "the current delivery reachable by this order's
 * owner", but the contract exposes no customer-readable GET /deliveries/{id}:
 * the list is `orders.update` (staff), `/deliveries/assigned` is
 * `delivery.assigned` (the agent), and `/deliveries/{id}` is PATCH-only. So
 * the Delivery RECORD cannot be fetched from the storefront.
 *
 * It does not need to be. Every delivery transition advances the order through
 * a matching status in the same transaction and appends a tracking event —
 * `out_for_delivery` → order `dispatched`, `delivered` → `delivered`,
 * `failed` → `failed`, `returned` → `return_requested`/`returned`.
 * The order's own status is therefore a faithful projection of the delivery's,
 * and `delivery_id` tells us a delivery exists at all, which is what the
 * `assigned` stage means before any agent has moved it.
 * ------------------------------------------------------------------------- */

/** The contract's Delivery.status enum, plus "none" for an order without one. */
export type DeliveryStage =
  | "none"
  | "assigned"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned";

/** The stages a delivery walks through, in order, for a progress display. */
export const DELIVERY_STAGES: readonly DeliveryStage[] = [
  "assigned",
  "out_for_delivery",
  "delivered",
] as const;

/** True for a stage no further step can follow. */
export function isTerminalStage(stage: DeliveryStage): boolean {
  return stage === "delivered" || stage === "failed" || stage === "returned";
}

/**
 * Where the order's delivery stands, derived from the order itself.
 *
 * A cancelled order keeps its delivery row but nobody is delivering it, so it
 * reports "none" rather than pretending an agent is still holding it.
 */
export function deliveryStageForOrder(order: Order): DeliveryStage {
  if (!order.delivery_id) return "none";

  const status = order.status as OrderStatus | undefined;
  switch (status) {
    // The delivery vocabulary and the order vocabulary differ by one word
    // here: an agent moving a delivery to `out_for_delivery` puts its order
    // into `dispatched`.
    case "dispatched":
      return "out_for_delivery";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "return_requested":
    case "returned":
      return "returned";
    case "cancelled":
      return "none";
    default:
      // pending, confirmed, preparing, ready_for_dispatch — the delivery
      // exists and is waiting on an agent, which is what `assigned` means.
      return "assigned";
  }
}

/**
 * The delivery a customer may rate: their own, and only once it arrived.
 *
 * Now a real contract field. It used to be minted from the order id because
 * `Order` carried no `delivery_id` at all, which meant the rating call could
 * only ever have worked against a fixture.
 */
export function deliveryIdForOrder(order: Order): string | null {
  if (order.status !== "delivered") return null;
  return order.delivery_id ?? null;
}
