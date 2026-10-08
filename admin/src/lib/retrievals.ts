import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Retrieval documents across all orders (GET /admin/retrievals, contract
 * 11.0): goods brought back from a delivery party, filtered by the server.
 * ------------------------------------------------------------------------- */

export type RetrievalListItem = components["schemas"]["RetrievalListItem"];

export const RETRIEVAL_STATUSES = ["open", "partially_received", "received", "closed"] as const;
type RetrievalStatus = (typeof RETRIEVAL_STATUSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The URL's filters as API parameters. Anything the API would refuse with a
 * 422 (a malformed id or day, an unknown status) is dropped, and an inverted
 * date range is ignored rather than sent.
 */
export function retrievalListQuery(filters: Record<string, string | undefined>, page: number, perPage: number) {
  const from = filters.from && DAY.test(filters.from) ? filters.from : undefined;
  const to = filters.to && DAY.test(filters.to) ? filters.to : undefined;
  const range = from && to && from > to ? {} : { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  return {
    page,
    per_page: perPage,
    ...(filters.party_id && UUID.test(filters.party_id) ? { party_id: filters.party_id } : {}),
    ...(filters.order_id && UUID.test(filters.order_id) ? { order_id: filters.order_id } : {}),
    ...((RETRIEVAL_STATUSES as readonly string[]).includes(filters.status ?? "") ? { status: filters.status as RetrievalStatus } : {}),
    ...range,
  };
}
