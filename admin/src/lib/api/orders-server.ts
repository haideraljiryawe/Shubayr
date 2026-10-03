import { ORDER_QUEUES, queueQuery, type OrderQueue } from "@/lib/orders";
import { load, type serverApi } from "./server";

type Api = Awaited<ReturnType<typeof serverApi>>;

/**
 * How many orders each work queue holds, from the API's own totals (one
 * per_page=1 request per queue). null where the count couldn't be read.
 */
export async function loadQueueCounts(api: Api): Promise<Record<OrderQueue, number | null>> {
  const results = await Promise.all(
    ORDER_QUEUES.map((queue) => load(api.GET("/admin/orders", { params: { query: { ...queueQuery(queue), page: 1, per_page: 1 } } }))),
  );
  return Object.fromEntries(ORDER_QUEUES.map((queue, index) => {
    const result = results[index]!;
    return [queue, result.ok ? result.data.total : null];
  })) as Record<OrderQueue, number | null>;
}
