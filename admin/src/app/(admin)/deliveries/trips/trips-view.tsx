"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { PartySearchFilter, type PartyChoice } from "@/components/parties/party-search";
import { DataTable, TableFilter, type Column, type TableState } from "@/components/table/data-table";
import { moneyText, toFixed } from "@/lib/purchasing";
import { TRIP_STATUSES, tripHref, type Trip } from "@/lib/trips";

const TONES = { open: "info", in_progress: "warning", closed: "neutral" } as const;

export function TripsView({ rows, state, driver, ignoredDates }: { rows: Trip[]; state: TableState; driver: PartyChoice | null; ignoredDates: boolean }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const format = useFormatter();
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);

  const columns: Column<Trip>[] = [
    {
      key: "number",
      header: t("list.columns.number"),
      cell: (row) => (
        <Link href={tripHref(row.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="trip-link">
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
      key: "driver",
      header: t("list.columns.driver"),
      cell: (row) => (
        <Link href={`/delivery-parties/${row.driver.id}`} className="hover:underline">
          {row.driver.name}
        </Link>
      ),
    },
    { key: "orders", header: t("list.columns.orders"), className: "text-end", cell: (row) => <span dir="ltr">{row.orders.length}</span> },
    {
      key: "fare",
      header: t("list.columns.fare"),
      cell: (row) => (
        <span>
          <span dir="ltr">{money(row.fare.amount_iqd)}</span>
          <span className="block text-xs text-text-muted">{t(`bearers.${row.fare.bearer}`)}</span>
        </span>
      ),
    },
    {
      key: "outstanding",
      header: t("list.columns.outstanding"),
      className: "text-end",
      cell: (row) => <span dir="ltr">{money(row.settlement.outstanding_cash_iqd)}</span>,
    },
    {
      key: "status",
      header: t("list.columns.status"),
      cell: (row) => (
        <Badge tone={TONES[row.status]} data-testid="trip-row-status" data-status={row.status}>
          {t(`statuses.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {ignoredDates ? <Alert tone="info">{t("list.ignoredDates")}</Alert> : null}
      <DataTable
        testId="trips-table"
        caption={t("list.title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("list.empty")}
        toolbar={
          <>
            <PartySearchFilter name="driver_party_id" label={t("list.columns.driver")} current={driver} kind="external_driver" />
            <TableFilter
              name="status"
              label={t("list.columns.status")}
              options={[{ value: "", label: t("list.anyStatus") }, ...TRIP_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))]}
            />
            <DateFilter name="date_from" label={t("list.from")} />
            <DateFilter name="date_to" label={t("list.to")} />
          </>
        }
      />
    </div>
  );
}
