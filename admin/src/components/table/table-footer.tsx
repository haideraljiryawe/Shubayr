"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@/components/ui";
import { countText, pageSummary, PER_PAGE_OPTIONS } from "@/lib/table-params";

/** Above this many pages the page indicator is plain text, not a picker. */
const MAX_PICKABLE_PAGES = 500;

/**
 * The footer band of every paginated table (VIS-012), inside the table's
 * card: the record summary on the inline start, page navigation in the
 * middle, the page-size selector on the inline end — mirrored by direction,
 * wrapping into rows on narrow screens. Navigation is hidden when everything
 * fits on one page; Previous/Next are disabled at the ends. The page
 * indicator ("Page 2 of 7") is itself the direct-navigation picker, so there
 * is no separate jump field. Numbers are isolated (<bdi>) so a range never
 * reorders inside Arabic text.
 */
export function TableFooter({
  total,
  page,
  perPage,
  onPage,
  onPerPage,
  pending = false,
  perPageOptions = PER_PAGE_OPTIONS,
}: {
  total: number;
  page: number;
  perPage: number;
  onPage: (page: number) => void;
  /** Omit for a table whose page size is fixed. */
  onPerPage?: (perPage: number) => void;
  pending?: boolean;
  perPageOptions?: readonly number[];
}) {
  const t = useTranslations("table");
  const summary = pageSummary(total, page, perPage);
  const current = Math.min(Math.max(1, page), summary.last);
  const n = (value: number) => countText(value);

  const text =
    summary.kind === "empty"
      ? t("empty")
      : summary.kind === "one"
        ? t("one")
        : summary.kind === "all"
          ? t("all", { total: n(summary.total) })
          : t("range", { from: n(summary.from), to: n(summary.to), total: n(summary.total) });

  return (
    <nav
      aria-label={t("pagination")}
      className="grid grid-cols-1 items-center gap-3 border-t border-border bg-card px-4 py-3 text-body text-text-muted sm:grid-cols-[1fr_auto_1fr]"
      data-testid="table-footer"
    >
      <p className="min-w-0" data-testid="table-range" aria-live="polite">
        <bdi>{text}</bdi>
      </p>

      <div className="flex items-center justify-center gap-2">
        {summary.last > 1 ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={current <= 1 || pending}
              onClick={() => onPage(current - 1)}
              data-testid="table-previous"
            >
              <ChevronRight className="size-4 ltr:rotate-180" aria-hidden />
              {t("previous")}
            </Button>
            {summary.last <= MAX_PICKABLE_PAGES ? (
              <Select
                value={current}
                disabled={pending}
                aria-label={t("pagePicker")}
                className="h-9 w-auto min-w-36"
                onValueChange={(value) => onPage(Number(value))}
                data-testid="table-page"
              >
                {Array.from({ length: summary.last }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {t("page", { page: n(index + 1), last: n(summary.last) })}
                  </option>
                ))}
              </Select>
            ) : (
              <span data-testid="table-page">
                {t("page", { page: n(current), last: n(summary.last) })}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={current >= summary.last || pending}
              onClick={() => onPage(current + 1)}
              data-testid="table-next"
            >
              {t("next")}
              <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
            </Button>
          </>
        ) : null}
      </div>

      {onPerPage ? (
        <label className="flex items-center justify-start gap-2 sm:justify-end">
          <span className="whitespace-nowrap">{t("perPage")}</span>
          <Select
            className="h-9 w-20"
            value={perPage}
            disabled={pending}
            onValueChange={(value) => onPerPage(Number(value))}
            data-testid="table-per-page"
          >
            {perPageOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  );
}

/**
 * TableFooter for a server-rendered table whose page lives in the URL
 * (`?page=`): changing page rewrites the query and keeps everything else.
 */
export function UrlTableFooter({
  total,
  page,
  perPage,
}: {
  total: number;
  page: number;
  perPage: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <TableFooter
      total={total}
      page={page}
      perPage={perPage}
      pending={pending}
      onPage={(next) => {
        const query = new URLSearchParams(searchParams.toString());
        query.set("page", String(next));
        startTransition(() => router.push(`${pathname}?${query.toString()}`, { scroll: false }));
      }}
    />
  );
}
