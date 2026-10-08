import type { OrderQueue } from "@/lib/orders";
import type { components } from "@/types/api";
import { load, type serverApi } from "./server";

type Api = Awaited<ReturnType<typeof serverApi>>;
type BadgeCounts = components["schemas"]["AdminOrderPage"]["badge_counts"];

/** The API's exact queue counts (contract 11.1: every order list carries them). */
export function queueCounts(badges: BadgeCounts): Record<OrderQueue, number> {
  return { late: badges.late, attention: badges.needs_attention, cancellation: badges.pending_cancellation };
}

/** For pages that don't list orders themselves: one per_page=1 read for the counts. */
export async function loadQueueCounts(api: Api): Promise<Record<OrderQueue, number | null>> {
  const result = await load(api.GET("/admin/orders", { params: { query: { page: 1, per_page: 1 } } }));
  return result.ok ? queueCounts(result.data.badge_counts) : { late: null, attention: null, cancellation: null };
}
