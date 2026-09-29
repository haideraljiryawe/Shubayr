"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardList, Eye, Search } from "lucide-react";
import { ORDER_STATUS_TONES } from "@/components/account/order-status";
import {
  AccountEmpty,
  AccountError,
  AccountSkeleton,
} from "@/components/account/states";
import { useTheme } from "@/components/providers/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, type MonitorOrderQuery, type OrderStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { shiftDay, storeDay, useStoreDateTime } from "@/lib/store-time";
import { useLatestRequest } from "@/lib/use-latest-request";
import { Pager } from "./pager";

/** Chip order: everything, then the lifecycle from new to finished. */
const CHIPS: Array<OrderStatus | "all"> = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
  "failed",
  "cancelled",
  "return_requested",
  "returned",
];

const PER_PAGE = 20;
/** How long typing must pause before the search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The order monitor's list: read-only, filtered and paged by the server.
 *
 * Every filter lives in the query the server receives — status, the search
 * text, the store-timezone date range and the page — and changing any of
 * them returns to page 1. The chips show the server's own per-status counts,
 * which are counted with the search and dates applied but not the status, so
 * picking a chip never zeroes the others.
 */
export function MonitorOrderList() {
  const t = useTranslations("monitor");
  const tWork = useTranslations("work");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const dateTime = useStoreDateTime();

  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // The search box is debounced; the other filters apply at once.
  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const timer = setTimeout(() => {
      setQ(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, q]);

  const rangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const query: MonitorOrderQuery = {
    status,
    q: q || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    per_page: PER_PAGE,
  };
  const orders = useLatestRequest(
    JSON.stringify(query),
    (signal) => api.listMonitorOrders(query, { signal }),
    // An impossible range is explained inline rather than sent as a 422.
    { enabled: !rangeInvalid },
  );

  const today = storeDay();
  const setRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  };

  const data = orders.data;
  const counts = data?.status_counts ?? {};

  return (
    <div className="flex flex-col gap-5" data-testid="monitor-orders">
      <p className="text-sm text-text-muted">{t("readOnly")}</p>

      <div
        role="group"
        aria-label={t("statusFilter")}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {CHIPS.map((chip) => (
          <Chip
            key={chip}
            selected={status === chip}
            onClick={() => {
              setStatus(chip);
              setPage(1);
            }}
            data-testid={`status-chip-${chip}`}
            className="shrink-0"
          >
            {tWork(`orderStatus.${chip}`)}
            <span
              className="rounded-full bg-black/5 px-1.5 text-[11px] tabular-nums"
              data-testid={`status-count-${chip}`}
            >
              {data ? (counts[chip] ?? 0) : "…"}
            </span>
          </Chip>
        ))}
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          maxLength={80}
          data-testid="monitor-search"
          startIcon={<Search className="size-5" aria-hidden />}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            {t("dateFrom")}
            <Input
              type="date"
              value={dateFrom}
              max={today}
              onChange={(event) => setRange(event.target.value, dateTo)}
              data-testid="monitor-date-from"
              className="h-10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            {t("dateTo")}
            <Input
              type="date"
              value={dateTo}
              max={today}
              onChange={(event) => setRange(dateFrom, event.target.value)}
              data-testid="monitor-date-to"
              className="h-10"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={dateFrom === today && dateTo === today}
              onClick={() => setRange(today, today)}
              data-testid="monitor-range-today"
            >
              {t("today")}
            </Chip>
            <Chip
              selected={dateFrom === shiftDay(today, -6) && dateTo === today}
              onClick={() => setRange(shiftDay(today, -6), today)}
              data-testid="monitor-range-7"
            >
              {t("last7")}
            </Chip>
            <Chip
              selected={!dateFrom && !dateTo}
              onClick={() => setRange("", "")}
              data-testid="monitor-range-all"
            >
              {t("clearDates")}
            </Chip>
          </div>
        </div>
        <p className="text-xs text-text-muted">{t("timezoneNote")}</p>
        {rangeInvalid ? (
          <p className="text-sm text-error-dark" role="alert" data-testid="monitor-range-invalid">
            {t("dateRangeInvalid")}
          </p>
        ) : null}
      </Card>

      {orders.failed ? (
        <AccountError message={tWork("loadError")} onRetry={orders.reload} />
      ) : orders.loading || !data ? (
        <AccountSkeleton rows={5} />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-3 transition-opacity",
            orders.stale && "opacity-60",
          )}
          aria-busy={orders.stale}
          data-testid="monitor-results"
          data-stale={orders.stale}
        >
          <p className="text-sm font-medium text-text" data-testid="monitor-total" aria-live="polite">
            {t("resultCount", { count: data.total })}
          </p>
          {data.data.length === 0 ? (
            <AccountEmpty
              icon={<ClipboardList className="size-7" aria-hidden />}
              title={t("empty")}
              body={t("emptyBody")}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.data.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/monitor/orders/${order.id}`}
                    data-testid="monitor-order-row"
                    data-order-number={order.order_number}
                    className="block rounded-lg focus-visible:outline-none"
                  >
                    <Card
                      padding="md"
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 transition-colors hover:bg-card"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-bold text-text" dir="ltr">
                          {order.order_number}
                        </span>
                        <span className="text-sm text-text">
                          {order.customer_name || t("noName")}
                          <span className="mx-2 text-text-muted" aria-hidden>
                            ·
                          </span>
                          <span dir="ltr" className="text-text-muted">
                            {order.customer_phone}
                          </span>
                        </span>
                        <span className="text-xs text-text-muted">
                          {dateTime(order.placed_at)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          tone={ORDER_STATUS_TONES[order.status] ?? "neutral"}
                          data-testid="monitor-order-status"
                          data-status={order.status}
                        >
                          {tWork(`orderStatus.${order.status}`)}
                        </Badge>
                        <span className="font-semibold text-text">
                          {formatPrice(order.total, currency, locale)}
                        </span>
                      </div>
                      <Eye className="size-4 text-text-muted" aria-hidden />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pager
            page={data.page}
            perPage={data.per_page}
            total={data.total}
            onPage={setPage}
          />
        </div>
      )}
    </div>
  );
}
