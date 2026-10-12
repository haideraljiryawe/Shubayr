"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DataTable, TableFilter, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { PARTY_KINDS, type DeliveryParty } from "@/lib/delivery-parties";
import { formatCost } from "@/lib/inventory";
import { moneyText, toFixed } from "@/lib/purchasing";

type Row = DeliveryParty & { custody_summary: NonNullable<DeliveryParty["custody_summary"]> };

/** The custody overview table; each row opens the party, or receives its cash. */
export function CustodyView({
  rows,
  state,
  canViewCost,
  canReceive,
}: {
  rows: Row[];
  state: TableState;
  canViewCost: boolean;
  canReceive: boolean;
}) {
  const t = useTranslations("parties");
  const locale = useLocale();
  const days = (value: number | null) => (value === null ? "—" : t("days", { count: value }));

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("columns.name"),
      sortKey: "name",
      cell: (party) => (
        <Link href={`/delivery-parties/${party.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="custody-party">
          {party.name}
        </Link>
      ),
    },
    {
      key: "kind",
      header: t("columns.kind"),
      cell: (party) => <Badge tone={party.kind === "external_driver" ? "warning" : "info"}>{t(`kinds.${party.kind}`)}</Badge>,
    },
    {
      key: "cash",
      header: t("custodyOverview.cashHeld"),
      sortKey: "cash_held",
      className: "text-end",
      cell: (party) => (
        <span dir="ltr" className="font-semibold" data-testid="custody-cash-held">
          {moneyText(toFixed(party.custody_summary.cash_held), "IQD", 0, locale)}
        </span>
      ),
    },
    {
      key: "orders",
      header: t("custodyOverview.ordersHeld"),
      sortKey: "orders_held",
      className: "text-end",
      cell: (party) => (
        <span dir="ltr" data-testid="custody-orders-held">
          {party.custody_summary.orders_held}
        </span>
      ),
    },
    ...(canViewCost
      ? ([
          {
            key: "value",
            header: t("custody.value"),
            sortKey: "goods_value_iqd",
            className: "text-end",
            cell: (party) => <span dir="ltr">{formatCost(party.custody_summary.goods_value_iqd, locale)}</span>,
          },
        ] satisfies Column<Row>[])
      : []),
    {
      key: "oldest",
      header: t("custody.oldest"),
      sortKey: "oldest_item_age_days",
      className: "text-end",
      cell: (party) => days(party.custody_summary.oldest_item_age_days),
    },
    ...(canReceive
      ? ([
          {
            key: "actions",
            header: <span className="sr-only">{t("columns.actions")}</span>,
            className: "text-end",
            cell: (party) =>
              party.is_active && party.custody_summary.cash_held > 0 ? (
                <Link
                  href={`/finance/cash-receipts/new?party_id=${party.id}`}
                  className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-dark hover:bg-card"
                  data-testid="custody-receive"
                >
                  {t("custodyOverview.receive")}
                </Link>
              ) : null,
          },
        ] satisfies Column<Row>[])
      : []),
  ];

  return (
    <DataTable
      testId="custody-overview"
      caption={t("custodyOverview.title")}
      rows={rows}
      columns={columns}
      rowKey={(party) => party.id}
      state={state}
      emptyLabel={t("empty")}
      toolbar={
        <>
          <TableSearch placeholder={t("search")} />
          <TableFilter
            name="kind"
            label={t("columns.kind")}
            options={[{ value: "", label: t("allKinds") }, ...PARTY_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))]}
          />
          <TableFilter
            name="status"
            label={t("columns.status")}
            options={[
              { value: "", label: t("allStatuses") },
              { value: "active", label: t("status.active") },
              { value: "inactive", label: t("status.inactive") },
            ]}
          />
        </>
      }
    />
  );
}
