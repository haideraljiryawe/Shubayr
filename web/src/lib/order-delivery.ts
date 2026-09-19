import type { Order } from "./api";

/**
 * The delivery a customer may rate for an order.
 *
 * CONTRACT GAP: `Order` in api/openapi.yaml carries no `delivery_id`, and
 * GET /deliveries/{id} is staff-scoped (x-permission), so a customer has no
 * contract route from their own order to the delivery that
 * POST /deliveries/{id}/rating expects. The fixture mints a stable id from the
 * order, and this one function is where the real field plugs in once the
 * contract adds `delivery_id` to Order — nothing else in the UI changes.
 */
export function deliveryIdForOrder(order: Order): string | null {
  // Only a delivered order has a delivery worth rating.
  if (order.status !== "delivered") return null;
  return order.id ? `dlv-${order.id}` : null;
}
