/* ---------------------------------------------------------------------------
 * Table state lives in the URL: `?q=&page=&per_page=&sort=&dir=` plus any
 * filters. The server page parses it and fetches/queries accordingly, and the
 * DataTable only ever rewrites the URL — so a table is linkable, survives a
 * reload, and the Back button walks through its history.
 * ------------------------------------------------------------------------- */

export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PER_PAGE = 20;

export type SortDir = "asc" | "desc";

export interface TableParams<S extends string = string> {
  q: string;
  page: number;
  perPage: number;
  sort: S;
  dir: SortDir;
  filters: Record<string, string>;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseTableParams<S extends string>(
  raw: RawSearchParams,
  options: {
    sortKeys: readonly S[];
    defaultSort: S;
    defaultDir?: SortDir;
    filterKeys?: readonly string[];
  },
): TableParams<S> {
  const sortRaw = first(raw.sort);
  const sort = options.sortKeys.includes(sortRaw as S)
    ? (sortRaw as S)
    : options.defaultSort;
  const dirRaw = first(raw.dir);
  const dir: SortDir =
    dirRaw === "asc" || dirRaw === "desc"
      ? dirRaw
      : (options.defaultDir ?? "asc");
  const perPageRaw = positiveInt(first(raw.per_page));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(
    perPageRaw ?? -1,
  )
    ? (perPageRaw as number)
    : DEFAULT_PER_PAGE;

  const filters: Record<string, string> = {};
  for (const key of options.filterKeys ?? []) {
    const value = first(raw[key])?.trim();
    if (value) filters[key] = value;
  }

  return {
    q: (first(raw.q) ?? "").trim().slice(0, 100),
    page: positiveInt(first(raw.page)) ?? 1,
    perPage,
    sort,
    dir,
    filters,
  };
}

/** Clamp a requested page into range once the total is known. */
export function clampPage(
  page: number,
  total: number,
  perPage: number,
): number {
  const last = Math.max(1, Math.ceil(total / perPage));
  return Math.min(Math.max(1, page), last);
}

export function paginate<T>(
  rows: readonly T[],
  page: number,
  perPage: number,
): T[] {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}

export type PageSummary =
  | { kind: "empty"; last: 1 }
  | { kind: "one"; last: 1 }
  | { kind: "all"; total: number; last: 1 }
  | { kind: "range"; from: number; to: number; total: number; last: number };

/**
 * Which record summary a table footer shows (VIS-012): no records, exactly
 * one, everything on one page ("Total records: 12"), or a range of a larger
 * set ("Showing 21 to 40 of 125 records"). Navigation is shown only when
 * `last > 1`.
 */
export function pageSummary(total: number, page: number, perPage: number): PageSummary {
  if (total <= 0) return { kind: "empty", last: 1 };
  if (total === 1) return { kind: "one", last: 1 };
  if (total <= perPage) return { kind: "all", total, last: 1 };
  const last = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), last);
  const from = (current - 1) * perPage + 1;
  return { kind: "range", from, to: Math.min(total, current * perPage), total, last };
}

/** Grouped Latin digits in both languages, as everywhere else in the admin. */
export function countText(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
