"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { PartySearchFilter, type PartyChoice } from "@/components/parties/party-search";
import { DataTable, TableFilter, useTableUrl, type Column, type TableState } from "@/components/table/data-table";
import { cn } from "@/lib/cn";
import { receiptHref, RECEIPT_STATUSES, type CashReceipt } from "@/lib/finance/cash-receipts";
import { moneyText, toFixed } from "@/lib/purchasing";

type Option = { value: string; label: string };

/** Vouchers, and the active ones with something left to allocate. */
export function ReceiptsTabs({ active }: { active: "vouchers" | "unallocated" }) {
  const t = useTranslations("cashReceipts.tabs");
  const tab = (key: "vouchers" | "unallocated", href: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      data-testid={`receipts-tab-${key}`}
      className={cn(
        "-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold",
        active === key ? "border-primary-dark text-primary-dark" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {t(key)}
    </Link>
  );
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("label")}>
      {tab("vouchers", "/finance/cash-receipts")}
      {tab("unallocated", "/finance/cash-receipts/unallocated")}
    </nav>
  );
}

/**
 * A page of receipt vouchers, filtered and paged by the server; the filters
 * live in the URL. On the unallocated list each row offers "Allocate", which
 * opens the voucher at its allocation step.
 */
export function ReceiptsView({
  mode,
  rows,
  state,
  party,
  accounts,
  ignoredDates,
  canAllocate,
}: {
  mode: "vouchers" | "unallocated";
  rows: CashReceipt[];
  state: TableState;
  /** The party the URL filters on, by name. */
  party: PartyChoice | null;
  /** The cash-account filter's choices; null without cash_accounts.view. */
  accounts: Option[] | null;
  ignoredDates: boolean;
  canAllocate: boolean;
}) {
  const t = useTranslations("cashReceipts.list");
  const tStatus = useTranslations("cashReceipts.detail.statuses");
  const locale = useLocale();
  const format = useFormatter();
  const { searchParams } = useTableUrl();
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  // A party or account from the URL that isn't among the choices is still shown as chosen.
  const withCurrent = (options: Option[], key: string, name: (row: CashReceipt) => string) => {
    const current = searchParams.get(key);
    if (!current || options.some((option) => option.value === current)) return options;
    const row = rows.find((entry) => (key === "party_id" ? entry.party_id : entry.cash_account_id) === current);
    return [...options, { value: current, label: row ? name(row) : current.slice(0, 8) }];
  };

  const columns: Column<CashReceipt>[] = [
    {
      key: "number",
      header: t("columns.number"),
      cell: (row) => (
        <Link href={receiptHref(row.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="receipt-link">
          {row.document_number}
        </Link>
      ),
    },
    {
      key: "date",
      header: t("columns.date"),
      cell: (row) => format.dateTime(new Date(row.document_date), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" }),
    },
    {
      key: "party",
      header: t("columns.party"),
      cell: (row) => (
        <Link href={`/delivery-parties/${row.party_id}`} className="hover:underline" data-testid="receipt-row-party">
          {row.party.name}
        </Link>
      ),
    },
    { key: "account", header: t("columns.account"), cell: (row) => row.cash_account.name },
    { key: "amount", header: t("columns.amount"), className: "text-end", cell: (row) => <span dir="ltr">{money(row.amount_iqd)}</span> },
    { key: "allocated", header: t("columns.allocated"), className: "text-end", cell: (row) => <span dir="ltr">{money(row.allocated_amount_iqd)}</span> },
    {
      key: "unallocated",
      header: t("columns.unallocated"),
      className: "text-end",
      cell: (row) => (
        <span dir="ltr" className="font-semibold" data-testid="receipt-row-unallocated">
          {money(row.unallocated_amount_iqd)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"} data-testid="receipt-row-status" data-status={row.status}>
          {tStatus(row.status)}
        </Badge>
      ),
    },
    ...(mode === "unallocated" && canAllocate
      ? ([
          {
            key: "actions",
            header: <span className="sr-only">{t("columns.actions")}</span>,
            className: "text-end",
            cell: (row) => (
              <Link
                href={`${receiptHref(row.id)}#allocate`}
                className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-dark hover:bg-card"
                data-testid="receipt-row-allocate"
              >
                {t("allocate")}
              </Link>
            ),
          },
        ] satisfies Column<CashReceipt>[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {ignoredDates ? (
        <Alert tone="info" data-testid="receipts-ignored-dates">
          {t("ignoredDates")}
        </Alert>
      ) : null}
      <DataTable
        testId={`receipts-table-${mode}`}
        caption={t(`caption.${mode}`)}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t(`empty.${mode}`)}
        toolbar={
          <>
            <PartySearchFilter name="party_id" label={t("filters.party")} current={party} />
            {accounts ? (
              <TableFilter
                name="cash_account_id"
                label={t("filters.account")}
                options={[{ value: "", label: t("filters.anyAccount") }, ...withCurrent(accounts, "cash_account_id", (row) => row.cash_account.name)]}
              />
            ) : null}
            <DateFilter name="date_from" label={t("filters.from")} />
            <DateFilter name="date_to" label={t("filters.to")} />
            {mode === "vouchers" ? (
              <TableFilter
                name="status"
                label={t("filters.status")}
                options={[{ value: "", label: t("filters.anyStatus") }, ...RECEIPT_STATUSES.map((value) => ({ value, label: tStatus(value) }))]}
              />
            ) : null}
          </>
        }
      />
    </div>
  );
}
