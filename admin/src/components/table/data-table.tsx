"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { NumberInput } from "@/components/forms/number-input";
import { cn } from "@/lib/cn";
import { PER_PAGE_OPTIONS, type SortDir } from "@/lib/table-params";

/* ---------------------------------------------------------------------------
 * DataTable — server-side pagination, sorting and filtering.
 *
 * The table never holds data it fetched itself. Its state is the URL
 * (`q`, `page`, `per_page`, `sort`, `dir` and filters); every control rewrites
 * the URL, the server page re-renders with the matching rows, and the table
 * shows them. That keeps one page of rows in the browser however large the
 * data set, and makes every view linkable.
 * ------------------------------------------------------------------------- */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Present when the server can sort on this column. */
  sortKey?: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface TableState {
  page: number;
  perPage: number;
  total: number;
  sort: string;
  dir: SortDir;
}

type Patch = Record<string, string | number | null>;

const PendingContext = createContext<{
  pending: boolean;
  update: (patch: Patch, resetPage?: boolean) => void;
} | null>(null);

/** Rewrite the table's URL state; a filter change goes back to page 1. */
export function useTableUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(patch: Patch, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    const query = next.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return { pending, update, searchParams };
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  state,
  toolbar,
  emptyLabel,
  caption,
  testId,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  state: TableState;
  toolbar?: ReactNode;
  emptyLabel: ReactNode;
  caption: string;
  testId?: string;
}) {
  const t = useTranslations("table");
  const { pending, update } = useTableUrl();
  const lastPage = Math.max(1, Math.ceil(state.total / state.perPage));
  const from = state.total === 0 ? 0 : (state.page - 1) * state.perPage + 1;
  const to = Math.min(state.total, state.page * state.perPage);

  function sortBy(key: string) {
    const dir: SortDir =
      state.sort === key && state.dir === "asc" ? "desc" : "asc";
    update({ sort: key, dir });
  }

  return (
    <PendingContext.Provider value={{ pending, update }}>
      <div className="flex flex-col gap-4" data-testid={testId}>
        {toolbar ? (
          <div className="flex flex-wrap items-end gap-3">{toolbar}</div>
        ) : null}

        <div
          className={cn(
            // `relative` keeps the sr-only caption and header labels (which
            // are absolutely positioned) inside this scroller; without it they
            // are placed against the page and, in RTL, widen the document.
            "relative overflow-x-auto rounded-lg border border-border bg-surface shadow-sm transition-opacity",
            pending && "opacity-60",
          )}
          aria-busy={pending || undefined}
        >
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-card text-text-muted">
              <tr>
                {columns.map((column) => {
                  const active =
                    column.sortKey && state.sort === column.sortKey;
                  const Icon = !active
                    ? ArrowUpDown
                    : state.dir === "asc"
                      ? ArrowUp
                      : ArrowDown;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn(
                        "px-4 py-3 text-start font-semibold",
                        column.className,
                      )}
                      aria-sort={
                        active
                          ? state.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {column.sortKey ? (
                        <button
                          type="button"
                          onClick={() => sortBy(column.sortKey!)}
                          className="inline-flex cursor-pointer items-center gap-1 hover:text-text"
                          data-testid={`sort-${column.sortKey}`}
                        >
                          {column.header}
                          <Icon className="size-3.5" aria-hidden />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-text-muted"
                  >
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="border-t border-border hover:bg-background"
                    data-testid="table-row"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 py-3 align-middle",
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <nav
          aria-label={t("pagination")}
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-muted"
        >
          <p data-testid="table-range">
            {t("range", { from, to, total: state.total })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span>{t("perPage")}</span>
              <Select
                className="h-9 w-20"
                value={state.perPage}
                onChange={(event) => update({ per_page: event.target.value })}
              >
                {PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={state.page <= 1 || pending}
              onClick={() => update({ page: state.page - 1 }, false)}
              aria-label={t("previous")}
            >
              <ChevronRight className="size-4 ltr:rotate-180" aria-hidden />
            </Button>
            <span data-testid="table-page">
              {t("page", { page: state.page, last: lastPage })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={state.page >= lastPage || pending}
              onClick={() => update({ page: state.page + 1 }, false)}
              aria-label={t("next")}
            >
              <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
            </Button>
            <GoToPage
              key={state.page}
              last={lastPage}
              onGo={(page) => update({ page }, false)}
            />
          </div>
        </nav>
      </div>
    </PendingContext.Provider>
  );
}

function GoToPage({
  last,
  onGo,
}: {
  last: number;
  onGo: (page: number) => void;
}) {
  const t = useTranslations("table");
  const [page, setPage] = useState<number | null>(null);
  return (
    <form
      className="flex items-start gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (page !== null) onGo(page);
      }}
    >
      <label className="sr-only" htmlFor="table-go-to">
        {t("goTo")}
      </label>
      <div className="flex w-20 flex-col gap-1">
        <NumberInput
          id="table-go-to"
          className="h-9"
          placeholder={t("goTo")}
          value={page}
          onValueChange={setPage}
          parse={{ integer: true, min: 1, max: last }}
        />
      </div>
      <Button
        size="sm"
        variant="secondary"
        type="submit"
        disabled={page === null}
      >
        {t("go")}
      </Button>
    </form>
  );
}

/** Debounced search box bound to `?q=`. */
export function TableSearch({ placeholder }: { placeholder: string }) {
  const { update, searchParams } = useTableUrl();
  const current = searchParams.get("q") ?? "";
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => update({ q: value.trim() }), 300);
    return () => window.clearTimeout(timer);
    // `update` is recreated per render; the debounce keys on the text only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative min-w-60 flex-1">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        className="ps-9"
        value={value}
        data-testid="table-search"
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}

/** A select bound to one filter key in the URL. */
export function TableFilter({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  const { update, searchParams } = useTableUrl();
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Select
        className="sm:min-w-40"
        value={searchParams.get(name) ?? ""}
        data-testid={`filter-${name}`}
        onChange={(event) => update({ [name]: event.target.value || null })}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function useTablePending(): boolean {
  return useContext(PendingContext)?.pending ?? false;
}
