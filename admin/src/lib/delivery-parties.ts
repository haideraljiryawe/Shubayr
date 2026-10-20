import type { components } from "@/types/api";
import type { BadgeTone } from "@/components/ui";
import { toE164 } from "@/lib/phone";
import type { TableParams } from "@/lib/table-params";

/* ---------------------------------------------------------------------------
 * Delivery parties (contract 11.2, 17.8.0): who carries an order — an
 * internal agent (a staff phone with the app), an external driver or a
 * courier company (both without an account, managed here) — and the goods
 * each one holds in custody.
 * ------------------------------------------------------------------------- */

export type DeliveryParty = components["schemas"]["DeliveryParty"];
export type PartyCustody = components["schemas"]["DeliveryPartyCustody"];
export type CustodyLine = components["schemas"]["DeliveryPartyCustodyLine"];
export type StatementEntry = components["schemas"]["DeliveryPartyStatementEntry"];
export type HeldOrder = components["schemas"]["DeliveryPartyHeldOrders"]["data"][number];
export type PartyKind = DeliveryParty["kind"];

export const PARTY_KINDS = ["internal_agent", "external_driver", "courier_company"] as const satisfies readonly PartyKind[];
/** The kinds managed on the parties page (drivers.manage); agents come from staff accounts. */
export const MANAGED_KINDS = ["external_driver", "courier_company"] as const satisfies readonly PartyKind[];
export type ManagedKind = (typeof MANAGED_KINDS)[number];

export const PARTY_TONE: Record<PartyKind, BadgeTone> = {
  internal_agent: "info",
  external_driver: "warning",
  courier_company: "neutral",
};
export const PARTY_FILTER_KEYS = ["kind", "status"] as const;
export const STATEMENT_FILTER_KEYS = ["from", "to", "order_id"] as const;
export type CashActivity = components["schemas"]["DeliveryPartyCashStatementEntry"];
/** The custody overview's server sorts; goods value needs cost.view. */
export const CUSTODY_SORT_KEYS = ["name", "cash_held", "orders_held", "oldest_item_age_days", "goods_value_iqd"] as const;

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

/* ------------------------------------------------------- courier companies */

export interface CourierValues {
  companyName: string;
  phone: string;
  contactPerson: string;
  notes: string;
}

export function courierValues(party: DeliveryParty | null): CourierValues {
  return {
    companyName: party?.name ?? "",
    phone: party?.phone ?? "",
    contactPerson: party?.contact_person ?? "",
    notes: party?.notes ?? "",
  };
}

/** POST /admin/courier-companies: optional fields left out when empty, the phone in E.164. */
export function courierBody(values: CourierValues): components["schemas"]["CourierCompanyCreate"] {
  const contact = values.contactPerson.trim();
  const notes = values.notes.trim();
  return {
    company_name: values.companyName.trim(),
    phone: toE164(values.phone),
    ...(contact ? { contact_person: contact } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** PATCH: only what changed; an emptied contact person or note is sent as "" (the API clears it). */
export function courierPatch(original: DeliveryParty, values: CourierValues): components["schemas"]["CourierCompanyUpdate"] | null {
  const before = courierValues(original);
  const patch: components["schemas"]["CourierCompanyUpdate"] = {};
  if (values.companyName.trim() !== before.companyName.trim()) patch.company_name = values.companyName.trim();
  if (toE164(values.phone) !== toE164(before.phone)) patch.phone = toE164(values.phone);
  if (values.contactPerson.trim() !== before.contactPerson.trim()) patch.contact_person = values.contactPerson.trim();
  if (values.notes.trim() !== before.notes.trim()) patch.notes = values.notes.trim();
  return Object.keys(patch).length ? patch : null;
}

/** The route that edits, deactivates or removes a managed party. */
export function managedPartyPath(kind: ManagedKind): "/admin/external-drivers/{id}" | "/admin/courier-companies/{id}" {
  return kind === "courier_company" ? "/admin/courier-companies/{id}" : "/admin/external-drivers/{id}";
}
