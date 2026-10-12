"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { PartySearchFilter, type PartyChoice } from "@/components/parties/party-search";
import { DataTable, TableFilter, type Column, type TableState } from "@/components/table/data-table";
import { EXCEPTION_STATUSES, EXCEPTION_TYPES, exceptionHref, type CustodyException } from "@/lib/finance/custody-exceptions";
import { moneyText, toFixed } from "@/lib/purchasing";

export function ExceptionsView({
  rows,
  state,
  party,
  orderFilter,
  ignoredDates,
}: {
  rows: CustodyException[];
  state: TableState;
  party: PartyChoice | null;
  orderFilter: string | null;
  ignoredDates: boolean;
}) {
  const t = useTranslations("custodyExceptions");
  const locale = useLocale();
  const format = useFormatter();
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const filteredOrder = orderFilter ? rows.find((row) => row.order_id === orderFilter)?.order.order_number : null;

  const columns: Column<CustodyException>[] = [
    {
      key: "number",
      header: t("list.columns.number"),
      cell: (row) => (
        <Link href={exceptionHref(row.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="exception-link">
          {row.document_number}
        </Link>
      ),
    },
    {
      key: "date",
      header: t("list.columns.date"),
      cell: (row) => format.dateTime(new Date(row.document_date), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" }),
    },
    {
      key: "type",
      header: t("list.columns.type"),
      cell: (row) => (
        <span data-testid="exception-row-type" data-type={row.type}>
          {t(`types.${row.type}`)}
          {row.liability_bearer ? <span className="block text-xs text-text-muted">{t(`bearers.${row.liability_bearer}`)}</span> : null}
        </span>
      ),
    },
    {
      key: "order",
      header: t("list.columns.order"),
      cell: (row) => (
        <Link href={`/orders/${row.order_id}`} className="hover:underline" dir="ltr">
          {row.order.order_number}
        </Link>
      ),
    },
    {
      key: "party",
      header: t("list.columns.party"),
      cell: (row) => (
        <Link href={`/delivery-parties/${row.party_id}`} className="hover:underline">
          {row.party.name}
        </Link>
      ),
    },
    { key: "amount", header: t("list.columns.amount"), className: "text-end", cell: (row) => <span dir="ltr">{money(row.amount_iqd)}</span> },
    {
      key: "status",
      header: t("list.columns.status"),
      cell: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"} data-testid="exception-row-status" data-status={row.status}>
          {t(`statuses.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">{t("list.howTo")}</Alert>
      {orderFilter ? (
        <p className="text-sm" data-testid="exceptions-order-filter">
          {t("list.forOrder", { number: filteredOrder ?? "…" })}{" "}
          <Link href="/finance/custody-exceptions" className="font-semibold text-primary-dark hover:underline">
            {t("list.allOrders")}
          </Link>
        </p>
      ) : null}
      {ignoredDates ? <Alert tone="info">{t("list.ignoredDates")}</Alert> : null}
      <DataTable
        testId="exceptions-table"
        caption={t("list.title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("list.empty")}
        toolbar={
          <>
            <TableFilter
              name="type"
              label={t("list.columns.type")}
              options={[{ value: "", label: t("list.anyType") }, ...EXCEPTION_TYPES.map((value) => ({ value, label: t(`types.${value}`) }))]}
            />
            <PartySearchFilter name="party_id" label={t("list.columns.party")} current={party} />
            <DateFilter name="date_from" label={t("list.from")} />
            <DateFilter name="date_to" label={t("list.to")} />
            <TableFilter
              name="status"
              label={t("list.columns.status")}
              options={[{ value: "", label: t("list.anyStatus") }, ...EXCEPTION_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))]}
            />
          </>
        }
      />
    </div>
  );
}
