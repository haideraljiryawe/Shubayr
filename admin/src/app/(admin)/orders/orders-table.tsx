"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardList, X } from "lucide-react";
import { Alert, Button, buttonClasses, Input } from "@/components/ui";
import {
  DataTable,
  TableFilter,
  TableSearch,
  useTableUrl,
  type Column,
  type TableState,
} from "@/components/table/data-table";
import { OrderFlags } from "@/components/orders/order-flags";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { ORDER_STATUSES, PICKABLE_STATUSES, formatMoney, type AdminOrder, type OrderStatus } from "@/lib/orders";

export function OrdersTable({
  rows,
  state,
  currency,
  invalidRange,
  canPick = false,
}: {
  rows: AdminOrder[];
  state: TableState;
  currency: string;
  invalidRange: boolean;
  /** inventory.pick: orders in preparation can be picked as a batch. */
  canPick?: boolean;
}) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const dateTime = useStoreDateTime();
  const [selected, setSelected] = useState<string[]>([]);
  const pickable = (order: AdminOrder) => canPick && PICKABLE_STATUSES.includes(order.status as OrderStatus);
  const pickableOnPage = rows.filter(pickable).length;
  // The statuses that can be picked, in the page's language: "preparing, ready … or failed".
  const pickableStatusList = new Intl.ListFormat(locale, { type: "disjunction" }).format(PICKABLE_STATUSES.map((status) => t(`status.${status}`)));
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => (on ? [...new Set([...current, id])] : current.filter((value) => value !== id)));

  const columns: Column<AdminOrder>[] = [
    ...(canPick
      ? [
          {
            key: "pick",
            header: <span className="sr-only">{t("pickList.select")}</span>,
            cell: (order: AdminOrder) =>
              pickable(order) ? (
                <input
                  type="checkbox"
                  className="size-4"
                  aria-label={t("pickList.selectOrder", { number: order.order_number ?? "" })}
                  checked={selected.includes(order.id!)}
                  onChange={(event) => toggle(order.id!, event.target.checked)}
                  data-testid="order-select"
                />
              ) : null,
          },
        ]
      : []),
    {
      key: "number",
      header: t("columns.number"),
      cell: (order) => (
        <Link
          href={`/orders/${order.id}`}
          className="font-semibold text-primary-dark hover:underline"
          dir="ltr"
          data-testid="order-link"
          data-order-number={order.order_number}
        >
          {order.order_number}
        </Link>
      ),
    },
    {
      key: "customer",
      header: t("columns.customer"),
      cell: (order) => (
        <div className="flex flex-col">
          <span>{order.customer?.name || t("noName")}</span>
          <span className="text-xs text-text-muted" dir="ltr">
            {order.customer?.phone}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (order) => (
        <div className="flex flex-wrap items-center gap-1">
          <OrderStatusBadge status={order.status} />
          <OrderFlags order={order} />
        </div>
      ),
    },
    {
      key: "total",
      header: t("columns.total"),
      // Contract 7.0: every order names its own currency; the store's is
      // only the fallback for an older API.
      cell: (order) =>
        formatMoney(order.total, order.currency ?? currency, locale),
    },
    {
      key: "placed",
      header: t("columns.placed"),
      cell: (order) => dateTime(order.placed_at),
    },
    {
      key: "agent",
      header: t("columns.agent"),
      cell: (order) => {
        // A party (internal agent or external driver, 11.2), or an older API's agent.
        const carrier = order.delivery?.party ?? order.delivery?.agent;
        return carrier ? (
          carrier.name || carrier.phone
        ) : (
          <span className="text-text-muted">{t("noAgent")}</span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {invalidRange ? (
        <Alert tone="info" data-testid="orders-invalid-range">
          {t("invalidRange")}
        </Alert>
      ) : null}
      <DataTable
        testId="orders-table"
        caption={t("title")}
        rows={rows}
        columns={columns}
        rowKey={(order) => order.id ?? order.order_number ?? ""}
        state={state}
        emptyLabel={t("empty")}
        toolbar={
          <>
            <TableSearch placeholder={t("search")} />
            <TableFilter
              name="status"
              label={t("filterStatus")}
              options={[
                { value: "", label: t("allStatuses") },
                ...ORDER_STATUSES.map((status) => ({
                  value: status,
                  label: t(`status.${status}`),
                })),
              ]}
            />
            <DateFilter name="from" label={t("from")} />
            <DateFilter name="to" label={t("to")} />
            {canPick && (pickableOnPage > 0 || selected.length > 0) ? (
              // The pick-list guidance lives with its own controls (VIS-016A), and
              // only where there is something that can be picked.
              <div className="flex flex-col items-start gap-1 self-end" data-testid="pick-controls" data-state={selected.length ? "selected" : "none"}>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.length ? (
                    <Link
                      href={`/orders/pick-lists?ids=${selected.join(",")}`}
                      className={buttonClasses({ variant: "secondary" })}
                      data-testid="pick-batch"
                    >
                      <ClipboardList className="size-4" aria-hidden />
                      {t("pickList.printSelected", { count: selected.length })}
                    </Link>
                  ) : (
                    <Button variant="secondary" disabled aria-describedby="pick-hint" data-testid="pick-batch-disabled">
                      <ClipboardList className="size-4" aria-hidden />
                      {t("pickList.printNone")}
                    </Button>
                  )}
                  {selected.length ? (
                    <Button size="sm" variant="ghost" onClick={() => setSelected([])} data-testid="pick-clear">
                      <X className="size-4" aria-hidden />
                      {t("pickList.clearSelection")}
                    </Button>
                  ) : null}
                </div>
                <p id="pick-hint" className="max-w-sm text-xs text-text-muted" data-testid="pick-hint">
                  {selected.length
                    ? t("pickList.selectedHint", { count: selected.length })
                    : t("pickList.selectGuide", { statuses: pickableStatusList })}
                </p>
              </div>
            ) : null}
          </>
        }
      />
    </div>
  );
}

/** A calendar day bound to one URL key; changing it returns to page 1. */
function DateFilter({ name, label }: { name: string; label: string }) {
  const { update, searchParams } = useTableUrl();
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Input
        type="date"
        value={searchParams.get(name) ?? ""}
        data-testid={`filter-${name}`}
        onChange={(event) => update({ [name]: event.target.value || null })}
      />
    </label>
  );
}
