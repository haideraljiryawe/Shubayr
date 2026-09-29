import type { TableParams } from "./table-params";

/* ---------------------------------------------------------------------------
 * The admin tables' URL state as the API's own list parameters.
 *
 * Since contract 6.2 the staff, preset and work-phone lists search, filter,
 * sort and paginate on the API. The table's URL keys already match the API's
 * (`q`, `page`, `per_page`, `sort`, `dir` and the filters), so these builders
 * only pass them through — dropping any filter value the API would refuse
 * with a 422, so a hand-edited URL shows an unfiltered table rather than an
 * error page.
 * ------------------------------------------------------------------------- */

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function common<S extends string>(params: TableParams<S>) {
  return {
    ...(params.q ? { q: params.q.slice(0, 160) } : {}),
    page: params.page,
    per_page: params.perPage,
    sort: params.sort,
    dir: params.dir,
  };
}

export const STAFF_SORT_KEYS = ["name", "username", "created_at"] as const;
export const STAFF_FILTER_KEYS = ["status", "preset"] as const;

export function staffListQuery(params: TableParams<(typeof STAFF_SORT_KEYS)[number]>) {
  const status = pick(params.filters.status, ["active", "inactive", "must_change"] as const);
  const preset = params.filters.preset && UUID.test(params.filters.preset) ? params.filters.preset : undefined;
  return {
    ...common(params),
    ...(status ? { status } : {}),
    ...(preset ? { preset } : {}),
  };
}

export const PRESET_SORT_KEYS = ["name", "permissions"] as const;
export const PRESET_FILTER_KEYS = ["kind"] as const;

export function presetListQuery(params: TableParams<(typeof PRESET_SORT_KEYS)[number]>) {
  const kind = pick(params.filters.kind, ["system", "custom"] as const);
  return { ...common(params), ...(kind ? { kind } : {}) };
}

export const WORK_PHONE_SORT_KEYS = ["name", "phone", "role"] as const;
export const WORK_PHONE_FILTER_KEYS = ["role", "status"] as const;

export function workPhoneListQuery(params: TableParams<(typeof WORK_PHONE_SORT_KEYS)[number]>) {
  const role = pick(params.filters.role, ["delivery_agent", "order_monitor"] as const);
  const status = pick(params.filters.status, ["active", "revoked"] as const);
  return {
    ...common(params),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  };
}

export interface ListPage<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * A list answer as one page. A queried call answers the page envelope; a
 * bare array (an older API, or no query) is treated as one page of everything.
 */
export function asPage<T>(
  body: readonly T[] | { data: readonly T[]; total: number; page: number; per_page: number },
  fallbackPerPage: number,
): ListPage<T> {
  if (Array.isArray(body)) {
    const rows = [...(body as readonly T[])];
    return { rows, total: rows.length, page: 1, perPage: Math.max(fallbackPerPage, rows.length) };
  }
  const page = body as { data: readonly T[]; total: number; page: number; per_page: number };
  return { rows: [...page.data], total: page.total, page: page.page, perPage: page.per_page };
}

/** The last page that has rows, when a stale URL asks past the end. */
export function lastPage(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}
