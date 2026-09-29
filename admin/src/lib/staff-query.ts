import type { components } from "@/types/api";
import { clampPage, paginate, type TableParams } from "./table-params";

export type StaffUser = components["schemas"]["StaffUser"];

export const STAFF_SORT_KEYS = ["name", "username", "created_at"] as const;
export type StaffSortKey = (typeof STAFF_SORT_KEYS)[number];
export const STAFF_FILTER_KEYS = ["status", "preset"] as const;

export interface StaffPage {
  rows: StaffUser[];
  total: number;
  page: number;
}

/**
 * Search, filter, sort and paginate the staff list — on the server.
 *
 * Unparameterized GET /admin/staff calls retain the legacy array response, so
 * this runs in the admin's server component, never in the browser. The page
 * ships one page of rows while newer callers can use the API's server-side
 * `q`, filters and pagination directly.
 */
export function queryStaff(
  all: readonly StaffUser[],
  params: TableParams<StaffSortKey>,
): StaffPage {
  const needle = params.q.toLocaleLowerCase();
  const status = params.filters.status;
  const preset = params.filters.preset;

  const matched = all.filter((user) => {
    if (
      needle &&
      ![user.username, user.name ?? "", user.email ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      )
    ) {
      return false;
    }
    if (status === "active" && !user.is_active) return false;
    if (status === "inactive" && user.is_active) return false;
    if (status === "must_change" && !user.must_change_password) return false;
    if (preset && !user.presets.some((item) => item.id === preset))
      return false;
    return true;
  });

  const direction = params.dir === "desc" ? -1 : 1;
  const sorted = [...matched].sort((a, b) => {
    const left = String(a[params.sort] ?? "");
    const right = String(b[params.sort] ?? "");
    const order = left.localeCompare(right, "ar");
    // Stable tiebreak on id so pages never overlap or skip a row.
    return (order || a.id.localeCompare(b.id)) * direction;
  });

  const page = clampPage(params.page, sorted.length, params.perPage);
  return {
    rows: paginate(sorted, page, params.perPage),
    total: sorted.length,
    page,
  };
}
