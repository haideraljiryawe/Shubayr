"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { DataTable, TableFilter, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { moneyText, toFixed } from "@/lib/purchasing";
import { RETURN_STATUSES, returnHref, type Return } from "@/lib/returns";
import { ReturnStatusBadge } from "./status-badge";

export type OrderLookup =
  | { kind: "none" }
  | { kind: "found"; number: string; id: string }
  | { kind: "missing"; number: string }
  | { kind: "forbidden"; number: string };

export function ReturnsView({
  rows,
  state,
  order,
  ignoredDates,
}: {
  rows: Return[];
  state: TableState;
  order: OrderLookup;
  ignoredDates: boolean;
}) {
  const t = useTranslations("returns");
  const locale = useLocale();
  const format = useFormatter();
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);

  const columns: Column<Return>[] = [
    {
      key: "number",
      sortKey: "number",
      header: t("list.columns.number"),
      cell: (row) => (
        <Link href={returnHref(row.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="return-link">
          {row.document_number}
        </Link>
      ),
    },
    {
      key: "date",
      sortKey: "date",
      header: t("list.columns.date"),
      cell: (row) => format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn", timeZone: "Asia/Baghdad" }),
    },
    {
      key: "order",
      header: t("list.columns.order"),
      cell: (row) => (
        <Link href={`/orders/${row.order_id}`} className="hover:underline" dir="ltr" data-testid="return-row-order">
          {row.order_number}
        </Link>
      ),
    },
    { key: "source", header: t("list.columns.source"), cell: (row) => t(`sources.${row.source}`) },
    { key: "lines", header: t("list.columns.lines"), cell: (row) => <span dir="ltr">{row.items.length}</span> },
    {
      key: "refund",
      sortKey: "refund",
      header: t("list.columns.refund"),
      cell: (row) => (
        <span dir="ltr" data-testid="return-row-refund">
          {money(row.status === "refunded" || row.status === "completed" ? row.refund_amount : row.expected_refund)}
        </span>
      ),
    },
    { key: "status", header: t("list.columns.status"), cell: (row) => <ReturnStatusBadge status={row.status} testId="return-row-status" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      {order.kind === "found" ? (
        <p className="text-sm" data-testid="returns-order-filter">
          {t("list.forOrder", { number: order.number })}
        </p>
      ) : null}
      {order.kind === "missing" ? (
        <Alert tone="info" data-testid="returns-order-missing">
          {t("list.orderMissing", { number: order.number })}
        </Alert>
      ) : null}
      {order.kind === "forbidden" ? (
        <Alert tone="info" data-testid="returns-order-forbidden">
          {t("list.orderForbidden")}
        </Alert>
      ) : null}
      {ignoredDates ? <Alert tone="info">{t("list.ignoredDates")}</Alert> : null}
      <DataTable
        testId="returns-table"
        caption={t("list.title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("list.empty")}
        toolbar={
          <>
            <TableSearch placeholder={t("list.search")} />
            <TableFilter
              name="status"
              label={t("list.columns.status")}
              options={[{ value: "", label: t("list.anyStatus") }, ...RETURN_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))]}
            />
            <DateFilter name="date_from" label={t("list.from")} />
            <DateFilter name="date_to" label={t("list.to")} />
          </>
        }
      />
    </div>
  );
}
