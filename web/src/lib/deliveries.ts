import { api, type Delivery, type DeliveryStatus } from "./api";

/**
 * The moves PATCH /deliveries/{id} accepts today, from its contract text:
 * assigned → out_for_delivery; out_for_delivery → delivered or failed;
 * delivered → returned. Failed and returned are terminal. The server owns
 * this table and still answers 409 when the delivery or its order has moved
 * on (a delivery may start only once its order is ready_for_dispatch), so
 * the UI offers these and explains a refusal rather than predicting it.
 *
 * Nothing the API does not offer yet is shown: no collected amount, no
 * failure reason, no custody — those arrive with a later backend phase.
 */
export type DeliveryAction = Exclude<DeliveryStatus, "assigned">;

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryAction[]> = {
  assigned: ["out_for_delivery"],
  out_for_delivery: ["delivered", "failed"],
  delivered: ["returned"],
  failed: [],
  returned: [],
};

/** A short, readable handle for a UUID. */
export function shortRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * One of the agent's deliveries.
 *
 * CONTRACT GAP: there is no GET /deliveries/{id} (that path is PATCH-only),
 * so this pages through the agent's own list — which the server scopes to
 * them — until it finds the id. Replace with the single read once it exists.
 */
export async function findAssignedDelivery(id: string): Promise<Delivery | null> {
  for (let page = 1; page <= 20; page += 1) {
    const result = await api.listAssignedDeliveries({ page, per_page: 100 });
    const match = result.data.find((delivery) => delivery.id === id);
    if (match) return match;
    if (page * result.per_page >= result.total) return null;
  }
  return null;
}
