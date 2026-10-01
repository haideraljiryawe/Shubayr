"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DataTable, TableFilter, type Column, type TableState } from "@/components/table/data-table";
import { DateFilter } from "@/components/finance/date-filter";
import { moneyText, precisionOf, toFixed, type PurchaseInvoice } from "@/lib/purchasing";

export function InvoicesTable({
  rows,
  state,
  suppliers,
  canViewCost,
}: {
  rows: PurchaseInvoice[];
  state: TableState;
  suppliers: Array<{ id: string; name: string }>;
  canViewCost: boolean;
}) {
  const t = useTranslations("purchasing.invoices");
  const ti = useTranslations("purchasing.invoice");
  const locale = useLocale();
  const format = useFormatter();
  const day = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" }) : "—");
  const money = (value: number | undefined, currency: string) =>
    value === undefined ? "—" : moneyText(toFixed(value), currency, precisionOf(currency), locale);

  const columns: Column<PurchaseInvoice>[] = [
    {
      key: "number",
      header: t("columns.document"),
      cell: (invoice) => (
        <div className="flex flex-col">
          <Link href={`/purchasing/invoices/${invoice.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="invoice-link">
            {invoice.document_number}
          </Link>
          {invoice.invoice_number ? <span className="text-xs text-text-muted" dir="ltr">{invoice.invoice_number}</span> : null}
        </div>
      ),
    },
    { key: "supplier", header: t("columns.supplier"), cell: (invoice) => invoice.supplier?.name ?? "—" },
    {
      key: "dates",
      header: t("columns.dates"),
      cell: (invoice) => (
        <div className="flex flex-col text-xs">
          <span>{day(invoice.document_date)}</span>
          <span className="text-text-muted">{t("due", { date: day(invoice.due_date) })}</span>
        </div>
      ),
    },
    ...(canViewCost
      ? [{ key: "total", header: t("columns.total"), className: "text-end", cell: (invoice: PurchaseInvoice) => <span dir="ltr">{money(invoice.total_cost, invoice.currency_code)}</span> }]
      : []),
    {
      key: "remaining",
      header: t("columns.remaining"),
      className: "text-end",
      cell: (invoice) => (
        <span dir="ltr" data-testid="invoice-row-remaining">
          {money(invoice.remaining_currency, invoice.currency_code)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (invoice) => {
        const status = invoice.settlement_status ?? "open";
        return (
          <Badge tone={status === "paid" ? "success" : status === "partial" ? "warning" : "info"} data-testid="invoice-row-status">
            {ti(`settlement.${status}`)}
          </Badge>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(invoice) => invoice.id}
      state={state}
      caption={t("title")}
      emptyLabel={t("empty")}
      testId="invoices-table"
      toolbar={
        <>
          <TableFilter
            name="supplier_id"
            label={t("columns.supplier")}
            options={[{ value: "", label: t("allSuppliers") }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]}
          />
          <TableFilter
            name="currency"
            label={t("currency")}
            options={[
              { value: "", label: t("allCurrencies") },
              { value: "IQD", label: "IQD" },
              { value: "USD", label: "USD" },
            ]}
          />
          <DateFilter name="from" label={t("from")} />
          <DateFilter name="to" label={t("to")} />
        </>
      }
    />
  );
}
