"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Input } from "@/components/ui";
import {
  DataTable,
  TableFilter,
  TableSearch,
  useTableUrl,
  type Column,
  type TableState,
} from "@/components/table/data-table";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { ORDER_STATUSES, formatMoney, type AdminOrder } from "@/lib/orders";

export function OrdersTable({
  rows,
  state,
  currency,
  invalidRange,
}: {
  rows: AdminOrder[];
  state: TableState;
  currency: string;
  invalidRange: boolean;
}) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const dateTime = useStoreDateTime();

  const columns: Column<AdminOrder>[] = [
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
      cell: (order) => <OrderStatusBadge status={order.status} />,
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
      cell: (order) =>
        order.delivery?.agent ? (
          order.delivery.agent.name || order.delivery.agent.phone
        ) : (
          <span className="text-text-muted">{t("noAgent")}</span>
        ),
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
          </>
        }
      />
      <p className="text-xs text-text-muted">{t("utcNote")}</p>
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
