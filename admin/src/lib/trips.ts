import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import { fixedText, toFixed } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * External-driver trips (contract 13.4, phase 8e). A trip is one driver, one
 * fare (paid by the store, or by the customer directly) and the orders handed
 * over to them. Staff record what happened to each order, the cash the
 * driver hands in, and close the trip with its settlement: the cash expected
 * from confirmed collections, what was received by cash receipts, the fare
 * netted (when the driver keeps it), and what is still outstanding.
 * ------------------------------------------------------------------------- */

export type Trip = components["schemas"]["ExternalDriverTrip"];
export type TripOrder = components["schemas"]["ExternalDriverTripOrder"];
export type TripStatus = Trip["status"];
export type FareBearer = Trip["fare"]["bearer"];
export type FareMethod = Trip["fare"]["settlement_method"];

export const TRIP_STATUSES = ["open", "in_progress", "closed"] as const satisfies readonly TripStatus[];
export const TRIP_FILTER_KEYS = ["driver_party_id", "status", "date_from", "date_to"] as const;
/** Which settlement methods each fare bearer allows (the API's rule). */
export const FARE_METHODS: Record<FareBearer, readonly FareMethod[]> = {
  store: ["payable", "cash_account", "driver_keeps"],
  customer_direct: ["customer_direct"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function tripListQuery(filters: Record<string, string | undefined>, page: number, perPage: number) {
  const from = filters.date_from && DAY.test(filters.date_from) ? filters.date_from : undefined;
  const to = filters.date_to && DAY.test(filters.date_to) ? filters.date_to : undefined;
  const inverted = Boolean(from && to && from > to);
  const status = (TRIP_STATUSES as readonly string[]).includes(filters.status ?? "") ? (filters.status as TripStatus) : undefined;
  return {
    query: {
      page,
      per_page: perPage,
      ...(filters.driver_party_id && UUID.test(filters.driver_party_id) ? { driver_party_id: filters.driver_party_id } : {}),
      ...(status ? { status } : {}),
      ...(inverted ? {} : { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) }),
    },
    ignoredDates: inverted,
  };
}

export function tripHref(id: string): string {
  return `/deliveries/trips/${encodeURIComponent(id)}`;
}

/**
 * Why an order keeps the trip from closing, or null when it is resolved: the
 * API's rule — delivered with a confirmed collection, returned, cancelled or
 * still ready for dispatch. Anything else blocks the close.
 */
export type Blocker = "notDelivered" | "unconfirmed";

export function orderBlocker(order: Pick<TripOrder, "status" | "collection">): Blocker | null {
  if (!["ready_for_dispatch", "delivered", "returned", "cancelled"].includes(order.status)) return "notDelivered";
  if (order.collection?.status === "unconfirmed") return "unconfirmed";
  return null;
}

export function blockingOrders(trip: Pick<Trip, "orders">) {
  return trip.orders.flatMap((order) => {
    const blocker = orderBlocker(order);
    return blocker ? [{ order, blocker }] : [];
  });
}

/**
 * What closing the trip would settle, before it is confirmed: the cash
 * expected from confirmed collections, what was handed in against them, the
 * store-paid fare the driver keeps (netted at close), and the difference
 * left open. Exact fixed point; negative outstanding means more was handed
 * in than collected.
 */
export function closePreview(trip: Pick<Trip, "fare" | "settlement" | "status">) {
  const expected = toFixed(trip.settlement.expected_cash_iqd);
  const received = toFixed(trip.settlement.received_cash_iqd);
  const alreadyNetted = toFixed(trip.settlement.netted_fare_iqd);
  const nettedAtClose =
    trip.status !== "closed" && trip.fare.bearer === "store" && trip.fare.settlement_method === "driver_keeps" ? toFixed(trip.fare.amount_iqd) : 0n;
  const netted = alreadyNetted + nettedAtClose;
  const outstanding = expected - received - netted;
  /** Netting more fare than unsettled cash is refused by the API. */
  const nettingTooLarge = nettedAtClose > 0n && nettedAtClose > expected - received;
  return { expected, received, netted, outstanding, result: outstanding === 0n ? ("settled" as const) : ("settlement_open" as const), nettingTooLarge };
}

/** The fare split evenly over the orders, the rounding left on the last one (whole dinars). */
export function splitFare(fare: string, count: number): string[] {
  if (count <= 0) return [];
  const total = BigInt(/^\d+$/.test(fare.trim()) ? fare.trim() : "0");
  const each = total / BigInt(count);
  return Array.from({ length: count }, (_, index) => String(index === count - 1 ? total - each * BigInt(count - 1) : each));
}

/** Sum of the orders' fare shares against the trip's fare: start needs them equal. */
export function shareTotals(trip: Pick<Trip, "fare" | "orders">) {
  const shares = trip.orders.reduce((sum, order) => sum + toFixed(order.fare_share_iqd), 0n);
  const fare = toFixed(trip.fare.amount_iqd);
  return { shares, fare, left: fare - shares, sharesText: fixedText(shares, 0) };
}

export type TripRefusal =
  | "unresolved"
  | "ownTrip"
  | "doubleCharge"
  | "acceptanceNote"
  | "notOpen"
  | "notInProgress"
  | "noOrders"
  | "sharesMismatch"
  | "notAssigned"
  | "driverNotFound"
  | "nettingTooLarge"
  | "inactiveAccount";

const MESSAGES: Array<[RegExp, TripRefusal]> = [
  [/cannot approve and close their own trip/i, "ownTrip"],
  [/customer_acceptance_note is required/i, "acceptanceNote"],
  [/orders can be added only to an open trip|only an open trip can be started/i, "notOpen"],
  [/only an in-progress trip can be closed/i, "notInProgress"],
  [/a trip requires at least one order/i, "noOrders"],
  [/fare shares must equal the one trip fare/i, "sharesMismatch"],
  [/trip handover requires the current assigned delivery/i, "notAssigned"],
  [/active external driver not found/i, "driverNotFound"],
  [/cannot keep more fare than unsettled collected cash|could not be fully allocated/i, "nettingTooLarge"],
  [/requires an active iqd cash account/i, "inactiveAccount"],
];

export function tripRefusal(error: unknown): TripRefusal | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "TRIP_ORDERS_UNRESOLVED") return "unresolved";
  if (error.code === "DOUBLE_DELIVERY_CHARGE") return "doubleCharge";
  for (const [pattern, kind] of MESSAGES) if (pattern.test(error.message)) return kind;
  return null;
}

/** The order ids a TRIP_ORDERS_UNRESOLVED refusal names (`orders.<id>`). */
export function unresolvedOrderIds(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  return error.errors.flatMap((entry) => {
    const match = /^orders\.(.+)$/.exec(entry.field ?? "");
    return match ? [match[1]] : [];
  });
}

/**
 * One operation id and one event time per exact trip request. The API hashes
 * the whole body, `event_at` included, so a retry must resend the same time
 * with the same id to be a replay; a different request gets both anew, and
 * `reset` after a success makes even an identical next request new.
 */
export class TripEventKey {
  private last: { signature: string; id: string; eventAt: string } | null = null;

  constructor(
    private readonly newId: () => string = () => `op-${crypto.randomUUID()}`,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  take(signature: string): { id: string; eventAt: string } {
    if (!this.last || this.last.signature !== signature) this.last = { signature, id: this.newId(), eventAt: this.now() };
    return { id: this.last.id, eventAt: this.last.eventAt };
  }

  reset(): void {
    this.last = null;
  }
}
