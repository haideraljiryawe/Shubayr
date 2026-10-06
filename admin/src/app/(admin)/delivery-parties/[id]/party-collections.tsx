"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge } from "@/components/ui";
import { AmountFilter } from "@/components/finance/amount-filter";
import { DateFilter } from "@/components/finance/date-filter";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { DataTable, TableFilter, type Column, type TableState } from "@/components/table/data-table";
import { COLLECTION_STATUSES, type DeliveryCollection } from "@/lib/collection";
import { formatMoney } from "@/lib/orders";

const TONES = { confirmed_full: "success", confirmed_short: "danger", unconfirmed: "warning" } as const;

/**
 * Every order the party delivered and what was collected for it (13.1):
 * in full, short (by how much) or not confirmed yet, and how much of the cash
 * is settled by receipts. Filtered by status, delivery day and amount due,
 * and paged, by the server; the filters live in the URL.
 */
export function PartyCollections({
  partyId,
  rows,
  state,
  orderFilter,
  ignored,
}: {
  partyId: string;
  rows: DeliveryCollection[];
  state: TableState;
  orderFilter: string | null;
  ignored: Array<"dates" | "amounts">;
}) {
  const t = useTranslations("collections");
  const tParty = useTranslations("parties.collections");
  const locale = useLocale();
  const dateTime = useStoreDateTime();
  const money = (row: DeliveryCollection, value: number | null | undefined) =>
    value === null || value === undefined ? "—" : formatMoney(value, row.currency, locale);
  const filteredOrder = orderFilter ? rows.find((row) => row.order_id === orderFilter)?.order?.order_number : null;

  const columns: Column<DeliveryCollection>[] = [
    {
      key: "order",
      header: t("queue.columns.order"),
      cell: (row) => (
        <Link href={`/orders/${row.order_id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="party-collection-order">
          {row.order?.order_number ?? row.order_id.slice(0, 8)}
        </Link>
      ),
    },
    { key: "delivered", header: t("queue.columns.delivered"), cell: (row) => dateTime(row.delivered_at) },
    {
      key: "status",
      header: t("filters.status"),
      cell: (row) => (
        <Badge tone={TONES[row.status]} data-testid="party-collection-status" data-status={row.status}>
          {t(`status.${row.status}`)}
        </Badge>
      ),
    },
    { key: "due", header: t("fields.due"), className: "text-end", cell: (row) => <span dir="ltr">{money(row, row.due_amount)}</span> },
    {
      key: "collected",
      header: t("summary.collected"),
      className: "text-end",
      cell: (row) => (
        <span dir="ltr" data-testid="party-collection-collected">
          {money(row, row.collected_amount)}
        </span>
      ),
    },
    {
      key: "shortfall",
      header: t("summary.shortfall"),
      className: "text-end",
      cell: (row) => (
        <span dir="ltr" className={row.status === "confirmed_short" ? "font-bold text-error-dark" : undefined} data-testid="party-collection-shortfall">
          {row.status === "confirmed_short" ? money(row, row.shortfall_amount) : "—"}
        </span>
      ),
    },
    {
      key: "settlement",
      header: t("settlement.title"),
      cell: (row) =>
        row.settlement_status ? (
          <span className="flex flex-col" data-testid="party-collection-settlement" data-settlement={row.settlement_status}>
            <span>{t(`settlement.${row.settlement_status}`)}</span>
            {row.unsettled_amount_iqd ? (
              <span className="text-xs text-text-muted">
                {t("settlement.unsettled_amount")}: <span dir="ltr">{formatMoney(row.unsettled_amount_iqd, "IQD", locale)}</span>
              </span>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-3" data-testid="party-collections" data-party={partyId}>
      {orderFilter ? (
        <p className="text-sm" data-testid="party-collections-order-filter">
          {tParty("forOrder", { number: filteredOrder ?? "…" })}{" "}
          <Link href={`/delivery-parties/${partyId}?tab=collections`} className="font-semibold text-primary-dark hover:underline">
            {tParty("allOrders")}
          </Link>
        </p>
      ) : null}
      {ignored.map((range) => (
        <Alert key={range} tone="info" data-testid={`collections-ignored-${range}`}>
          {t(`filters.ignored.${range}`)}
        </Alert>
      ))}
      <DataTable
        testId="party-collections-table"
        caption={tParty("title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={tParty("empty")}
        toolbar={
          <>
            <TableFilter
              name="status"
              label={t("filters.status")}
              options={[{ value: "", label: t("filters.anyStatus") }, ...COLLECTION_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))]}
            />
            <DateFilter name="date_from" label={t("filters.from")} />
            <DateFilter name="date_to" label={t("filters.to")} />
            <AmountFilter name="amount_min" label={t("filters.amountMin")} />
            <AmountFilter name="amount_max" label={t("filters.amountMax")} />
          </>
        }
      />
      <p className="text-xs text-text-muted">{t("filters.note")}</p>
      <Link href={`/deliveries/unconfirmed?party_id=${partyId}`} className="text-sm font-semibold text-primary-dark hover:underline" data-testid="party-collections-to-confirm">
        {tParty("toConfirm")}
      </Link>
    </section>
  );
}
