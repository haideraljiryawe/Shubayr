"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Input, Select } from "@/components/ui";
import type { SortDir } from "@/lib/table-params";
import { EmptyRow, Table, TableCard, TBody, Td, Th, THead, Tr } from "./table";
import { TableFooter } from "./table-footer";

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
  /** Logical alignment of heading and cells together; "end" for row actions. */
  align?: "start" | "end" | "center";
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
  const { pending, update } = useTableUrl();

  function sortBy(key: string) {
    const dir: SortDir =
      state.sort === key && state.dir === "asc" ? "desc" : "asc";
    update({ sort: key, dir });
  }

  return (
    <PendingContext.Provider value={{ pending, update }}>
      <TableCard
        toolbar={toolbar}
        pending={pending}
        data-testid={testId}
        footer={
          <TableFooter
            total={state.total}
            page={state.page}
            perPage={state.perPage}
            pending={pending}
            onPage={(page) => update({ page }, false)}
            onPerPage={(perPage) => update({ per_page: perPage })}
          />
        }
      >
        <Table caption={caption} minWidth="40rem">
          <THead>
            <Tr>
              {columns.map((column) => {
                const active = column.sortKey && state.sort === column.sortKey;
                const Icon = !active
                  ? ArrowUpDown
                  : state.dir === "asc"
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <Th
                    key={column.key}
                    align={column.align}
                    className={column.className}
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
                  </Th>
                );
              })}
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={columns.length}>{emptyLabel}</EmptyRow>
            ) : (
              rows.map((row) => (
                <Tr key={rowKey(row)} data-testid="table-row">
                  {columns.map((column) => (
                    <Td key={column.key} align={column.align} className={column.className}>
                      {column.cell(row)}
                    </Td>
                  ))}
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </TableCard>
    </PendingContext.Provider>
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
    <label className="flex w-full flex-col gap-1 text-label sm:w-auto">
      <span>{label}</span>
      <Select
        className="sm:min-w-40"
        value={searchParams.get(name) ?? ""}
        data-testid={`filter-${name}`}
        onValueChange={(value) => update({ [name]: value || null })}
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
