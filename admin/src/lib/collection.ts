import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * COD collection on delivery (contract 12.0): delivered says what was
 * collected — a confirmed amount, or "not confirmed yet" to confirm later —
 * and every posting carries an operation id, so a double click or a retry
 * replays the first answer instead of posting the revenue or cash twice.
 * ------------------------------------------------------------------------- */

export type DeliveryCollection = components["schemas"]["DeliveryCollection"];
export type CollectionStatus = DeliveryCollection["status"];
export type CollectionChoice = "confirmed" | "unconfirmed";

/** Six decimals, the API's amount precision, as integer micro-units. */
const SCALE = 6;

function toMicro(value: number | string): bigint {
  const text = typeof value === "number" ? value.toFixed(SCALE) : value;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(SCALE) + BigInt((fraction + "0".repeat(SCALE)).slice(0, SCALE));
}

function fromMicro(micro: bigint): number {
  return Number(micro) / 10 ** SCALE;
}

export type CollectionPreview =
  | { state: "full" }
  | { state: "short"; shortfall: number }
  | { state: "over" }
  | { state: "unconfirmed" }
  | { state: "invalid" };

/**
 * What confirming would record, before it is sent: the full amount, a
 * shortfall (and how much), or an amount above what is due (the API
 * refuses that). Exact: amounts are compared in micro-units, not floats.
 */
export function previewCollection(due: number, choice: CollectionChoice, amount: string | null): CollectionPreview {
  if (choice === "unconfirmed") return { state: "unconfirmed" };
  if (amount === null) return { state: "invalid" };
  const dueMicro = toMicro(due);
  const collected = toMicro(amount);
  if (collected > dueMicro) return { state: "over" };
  if (collected === dueMicro) return { state: "full" };
  return { state: "short", shortfall: fromMicro(dueMicro - collected) };
}

/**
 * One operation id per exact request: the same choice and amount reuse it (a
 * retry replays), anything different gets a new one (the API refuses an id
 * reused with a different body).
 */
export class CollectionOperation {
  private last: { key: string; id: string } | null = null;

  constructor(
    private readonly prefix: string,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  id(...parts: Array<string | null>): string {
    const key = parts.map((part) => part ?? "").join(":");
    if (!this.last || this.last.key !== key) this.last = { key, id: `${this.prefix}-${this.newId()}` };
    return this.last.id;
  }
}

/** The staff delivery body's collection fields (PATCH /admin/deliveries/{id}/status). */
export function staffDeliveryFields(operation: CollectionOperation, choice: CollectionChoice, amount: string | null) {
  return {
    operation_id: operation.id(choice, amount),
    collection_confirmation: choice,
    ...(choice === "confirmed" && amount !== null ? { collected_amount: amount } : {}),
    // Who recorded it is the signed-in staff member (the API audits the actor);
    // the source says it was keyed in the Web Admin on the party's behalf.
    source: "web_admin",
  };
}

/* ---------------------------------------------------------------------------
 * Collection lists (contract 13.1): a party's delivered-order collections and
 * the "cash to confirm" queue, filtered by the server. Dates are Baghdad
 * business days of delivery; amounts are the amount due.
 * ------------------------------------------------------------------------- */

/** The customer-safe result the order read carries (13.1). */
export type OrderCollection = NonNullable<components["schemas"]["AdminOrder"]["collection"]>;

/** The order read's result in the collection list's words, so both read alike. */
export const RESULT_STATUS = {
  full: "confirmed_full",
  short: "confirmed_short",
  unconfirmed: "unconfirmed",
} as const satisfies Record<OrderCollection["result"], CollectionStatus>;

export const COLLECTION_STATUSES = ["confirmed_full", "confirmed_short", "unconfirmed"] as const satisfies readonly CollectionStatus[];
export const PARTY_COLLECTION_FILTER_KEYS = ["status", "order_id", "date_from", "date_to", "amount_min", "amount_max"] as const;
export const QUEUE_FILTER_KEYS = ["party_id", "date_from", "date_to", "amount_min", "amount_max"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A typed amount ("25,000" or "25000.5") as a number; anything else is no filter. */
export function amountFilter(raw: string | undefined): number | undefined {
  const text = (raw ?? "").replace(/[\s,٬]/g, "");
  return /^\d+(\.\d{1,6})?$/.test(text) ? Number(text) : undefined;
}

/**
 * The URL's filters as API parameters. A malformed value is dropped, and an
 * inverted range — which the API refuses with a 422 — is not sent but named
 * in `ignored`, so the page can say why it isn't applied.
 */
export function collectionListQuery(filters: Record<string, string | undefined>, page: number, perPage: number) {
  const ignored: Array<"dates" | "amounts"> = [];
  const from = filters.date_from && DAY.test(filters.date_from) ? filters.date_from : undefined;
  const to = filters.date_to && DAY.test(filters.date_to) ? filters.date_to : undefined;
  const min = amountFilter(filters.amount_min);
  const max = amountFilter(filters.amount_max);
  const dates = from && to && from > to ? (ignored.push("dates"), {}) : { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) };
  const amounts =
    min !== undefined && max !== undefined && min > max
      ? (ignored.push("amounts"), {})
      : { ...(min !== undefined ? { amount_min: min } : {}), ...(max !== undefined ? { amount_max: max } : {}) };
  const status = (COLLECTION_STATUSES as readonly string[]).includes(filters.status ?? "") ? (filters.status as CollectionStatus) : undefined;
  return {
    query: {
      page,
      per_page: perPage,
      ...(status ? { status } : {}),
      ...(filters.order_id && UUID.test(filters.order_id) ? { order_id: filters.order_id } : {}),
      ...(filters.party_id && UUID.test(filters.party_id) ? { party_id: filters.party_id } : {}),
      ...dates,
      ...amounts,
    },
    ignored,
  };
}
