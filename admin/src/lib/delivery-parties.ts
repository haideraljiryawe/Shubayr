import type { components } from "@/types/api";
import type { TableParams } from "@/lib/table-params";

/* ---------------------------------------------------------------------------
 * Delivery parties (contract 11.2): who carries an order — an internal agent
 * (a staff phone with the app) or an external driver (no account, managed
 * here) — and the goods each one holds in custody.
 * ------------------------------------------------------------------------- */

export type DeliveryParty = components["schemas"]["DeliveryParty"];
type Custody = components["schemas"]["DeliveryPartyCustody"];
/**
 * The custody read as the client returns it: openapi-fetch drops keys whose
 * only type is null (the cash age until collections exist), so it is optional.
 */
export type PartyCustody = Omit<Custody, "cash"> & { cash: Omit<Custody["cash"], "oldest_age_days"> & { oldest_age_days?: null } };
export type CustodyLine = components["schemas"]["DeliveryPartyCustodyLine"];
export type StatementEntry = components["schemas"]["DeliveryPartyStatementEntry"];
export type HeldOrder = components["schemas"]["DeliveryPartyHeldOrders"]["data"][number];
export type PartyKind = DeliveryParty["kind"];

export const PARTY_KINDS = ["internal_agent", "external_driver"] as const satisfies readonly PartyKind[];
export const PARTY_FILTER_KEYS = ["kind", "status"] as const;
export const STATEMENT_FILTER_KEYS = ["from", "to", "order_id"] as const;

/** Any of these lists parties (the picker, the list page). */
export const PARTY_LIST_PERMISSIONS = ["deliveries.manage", "orders.assign_agent", "drivers.manage"] as const;

export function canListParties(permissions: readonly string[]): boolean {
  return PARTY_LIST_PERMISSIONS.some((key) => permissions.includes(key));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The list URL as API parameters; unknown filter values are dropped. */
export function partyListQuery(params: Pick<TableParams, "q" | "page" | "perPage" | "filters">) {
  const kind = (PARTY_KINDS as readonly string[]).includes(params.filters.kind ?? "") ? (params.filters.kind as PartyKind) : undefined;
  const status = params.filters.status;
  return {
    page: params.page,
    per_page: params.perPage,
    ...(params.q ? { q: params.q.slice(0, 120) } : {}),
    ...(kind ? { kind } : {}),
    ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
  };
}

/**
 * The statement URL as API parameters. A malformed day or order id is
 * dropped, and an inverted range (which the API answers with a 400) is
 * ignored rather than sent.
 */
export function statementQuery(filters: Record<string, string | undefined>, page: number, perPage: number) {
  const from = filters.from && DAY.test(filters.from) ? filters.from : undefined;
  const to = filters.to && DAY.test(filters.to) ? filters.to : undefined;
  const range = from && to && from > to ? {} : { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  return {
    page,
    per_page: perPage,
    ...(filters.order_id && UUID.test(filters.order_id) ? { order_id: filters.order_id } : {}),
    ...range,
  };
}

/** "Name · phone", for pickers and filters. */
export function partyLabel(party: Pick<DeliveryParty, "name" | "phone">): string {
  return party.name ? `${party.name} · ${party.phone}` : party.phone;
}

/** Statement events that add to custody (+) or take from it (−). */
export function isIssue(entry: Pick<StatementEntry, "event">): boolean {
  return entry.event === "issue_to_custody";
}
