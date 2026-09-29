import type { components } from "@/types/api";
import type { TableParams } from "./table-params";

/* ---------------------------------------------------------------------------
 * The audit log (GET /admin/audit-logs, audit.view) as a server-side table.
 *
 * `action` and `entity_type` are exact matches on the API, so they are
 * picked from the values the backend records (unknown values in a URL are
 * kept, so a link to a newer action still filters). `actor` is a contains
 * search over name and username, or an exact user id. Dates are store days
 * (Asia/Baghdad) turned into the instants the API compares against.
 * ------------------------------------------------------------------------- */

export type AuditLog = components["schemas"]["AuditLog"];

/** Every action the backend records today (contract 8.0), for the filter. */
export const AUDIT_ACTIONS = [
  "accounting_period.close",
  "accounting_period.reopen",
  "admin.login",
  "cash_account.create",
  "cash_account.delete",
  "cash_account.update",
  "catalog.brand.create",
  "catalog.brand.delete",
  "catalog.brand.update",
  "catalog.category.convert_to_brand",
  "catalog.product.create",
  "catalog.product.update",
  "currency.update",
  "delivery.assign",
  "delivery.dispatch",
  "delivery.transition",
  "device_token.register",
  "device_token.unregister",
  "exchange_rate.create",
  "exchange_rate.save_only",
  "loyalty.adjust",
  "loyalty.earn",
  "loyalty.redeem",
  "notification_preference.update",
  "order.cancel",
  "order.reject",
  "order.transition",
  "payment.reconcile_cod",
  "permission_preset.create",
  "permission_preset.delete",
  "permission_preset.update",
  "prices.linked.publish",
  "product_review.create",
  "product_review.delete",
  "product_review.edit",
  "product_review.moderate",
  "refund.obligation",
  "return.complete",
  "return.disposition",
  "return.request",
  "return.restock",
  "return.review",
  "settings.update",
  "staff.access.replace",
  "staff.create",
  "staff.deactivate",
  "staff.password.change",
  "staff.password.reset",
  "staff.update",
  "wishlist_item.create",
  "wishlist_item.delete",
  "work_phone.register",
  "work_phone.revoke",
  "work_phone.update",
] as const;

export const AUDIT_ENTITIES = [
  "accounting_period",
  "admin_session",
  "brand",
  "cash_account",
  "currency",
  "delivery",
  "device_token",
  "exchange_rate",
  "loyalty_ledger",
  "notification_preference",
  "order",
  "payment",
  "permission_preset",
  "product",
  "product_review",
  "refund_ledger",
  "return",
  "return_item",
  "settings",
  "stock_movement",
  "user",
  "wishlist_item",
  "work_profile",
] as const;

export const AUDIT_FILTER_KEYS = ["actor", "action", "entity_type", "entity_id", "from", "to"] as const;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[a-z_.]{1,80}$/;

/** Start of a store day (Asia/Baghdad, fixed +03:00) as an instant. */
export function storeDayStart(day: string): string {
  return new Date(`${day}T00:00:00.000+03:00`).toISOString();
}

/** Last millisecond of a store day, inclusive. */
export function storeDayEnd(day: string): string {
  return new Date(new Date(`${day}T00:00:00.000+03:00`).getTime() + 86_400_000 - 1).toISOString();
}

export function auditListQuery(params: TableParams<"created_at">): {
  query: Record<string, string | number>;
  invalidRange: boolean;
} {
  const f = params.filters;
  let from = f.from && DAY.test(f.from) ? f.from : undefined;
  let to = f.to && DAY.test(f.to) ? f.to : undefined;
  const invalidRange = Boolean(from && to && from > to);
  if (invalidRange) {
    from = undefined;
    to = undefined;
  }
  const actor = f.actor?.trim().slice(0, 160);
  return {
    invalidRange,
    query: {
      page: params.page,
      per_page: params.perPage,
      ...(actor ? { actor } : {}),
      ...(f.action && NAME.test(f.action) ? { action: f.action } : {}),
      ...(f.entity_type && NAME.test(f.entity_type) ? { entity_type: f.entity_type } : {}),
      ...(f.entity_id && UUID.test(f.entity_id) ? { entity_id: f.entity_id } : {}),
      ...(from ? { from: storeDayStart(from) } : {}),
      ...(to ? { to: storeDayEnd(to) } : {}),
    },
  };
}

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * What a record changed, top-level field by field. Records that are not a
 * before/after pair of objects are shown as one "value" change.
 */
export function auditChanges(before: unknown, after: unknown): AuditChange[] {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (!isObject(before) && !isObject(after)) {
    if (before === null && after === null) return [];
    return [{ field: "value", before: show(before), after: show(after) }];
  }
  const old = isObject(before) ? before : {};
  const next = isObject(after) ? after : {};
  return [...new Set([...Object.keys(old), ...Object.keys(next)])]
    .filter((key) => !["updated_at", "created_at"].includes(key))
    .filter((key) => JSON.stringify(old[key]) !== JSON.stringify(next[key]))
    .sort()
    .map((key) => ({ field: key, before: show(old[key]), after: show(next[key]) }));
}
