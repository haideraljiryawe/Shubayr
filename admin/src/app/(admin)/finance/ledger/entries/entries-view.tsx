"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Card } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import {
  DataTable,
  TableFilter,
  type Column,
  type TableState,
} from "@/components/table/data-table";
import { formatAmount } from "@/lib/finance/money";
import type { components } from "@/types/api";

type Entry = components["schemas"]["JournalEntry"];
type EntryPage = components["schemas"]["JournalEntryPage"];

interface Line {
  debit_base: string;
  credit_base: string;
  currency_code: string;
  original_amount: string;
  exchange_rate: string;
  memo?: string | null;
  account?: { code?: string; name_ar?: string; name_en?: string };
}

/** The source types that post today (API 7.0), for the filter. */
const SOURCE_TYPES = ["cash_opening_balance", "cash_transfer", "journal_reversal"] as const;

function entriesHref(filters: Record<string, string>): string {
  return `/finance/ledger/entries?${new URLSearchParams(filters)}`;
}

export function EntriesView({
  entries,
  accounts,
  balance,
  baseCode,
  basePrecision,
  state,
}: {
  entries: EntryPage;
  accounts: Array<{ code: string; name_ar: string; name_en: string }>;
  balance: Record<string, unknown> | null;
  baseCode: string;
  basePrecision: number;
  state: TableState;
}) {
  const t = useTranslations("ledger");
  const locale = useLocale();
  const format = useFormatter();
  const money = (value: string | number | undefined) => formatAmount(value ?? "0", baseCode, basePrecision, locale);
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const accountName = (row: { name_ar?: string; name_en?: string }) => (locale === "ar" ? row.name_ar : row.name_en) ?? "";

  const columns: Column<Entry>[] = [
    {
      key: "document",
      header: t("columns.document"),
      cell: (entry) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold" dir="ltr" data-testid="entry-number">{entry.document_number}</span>
          <span className="text-xs text-text-muted">{t.has(`source.${entry.source_type}`) ? t(`source.${entry.source_type}`) : entry.source_type}</span>
          {entry.reverses_id ? (
            <Badge tone="warning" data-testid="entry-reversal">{t("reversal")}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "dates",
      header: t("columns.dates"),
      cell: (entry) => (
        <div className="flex flex-col text-xs">
          <span>{t("accountingDate", { date: day(entry.accounting_date) })}</span>
          <span className="text-text-muted">{t("documentDate", { date: day(entry.document_date) })}</span>
        </div>
      ),
    },
    {
      key: "lines",
      header: t("columns.lines"),
      cell: (entry) => (
        <table className="w-full text-xs">
          <tbody>
            {(entry.lines as unknown as Line[]).map((line, index) => (
              <tr key={index}>
                <td className="py-0.5 pe-2">
                  <Link
                    href={entriesHref({ account_code: line.account?.code ?? "" })}
                    className="text-primary-dark hover:underline"
                    dir="ltr"
                  >
                    {line.account?.code}
                  </Link>{" "}
                  {line.account ? accountName(line.account) : ""}
                </td>
                <td className="py-0.5 text-end" dir="ltr">{Number(line.debit_base) ? money(line.debit_base) : ""}</td>
                <td className="py-0.5 text-end" dir="ltr">{Number(line.credit_base) ? money(line.credit_base) : ""}</td>
                <td className="py-0.5 ps-2 text-text-muted" dir="ltr">
                  {line.currency_code !== baseCode
                    ? `${formatAmount(line.original_amount, line.currency_code, 2, locale)} × ${line.exchange_rate}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "links",
      header: <span className="sr-only">{t("columns.links")}</span>,
      cell: (entry) => (
        <div className="flex flex-col gap-1 text-xs">
          {entry.description ? <span className="text-text-muted">{entry.description}</span> : null}
          <Link className="text-primary-dark hover:underline" href={entriesHref({ source_id: entry.source_id })} data-testid="entry-source-link">
            {t("sourceEntries")}
          </Link>
          {entry.reverses_id ? (
            <span className="text-text-muted" dir="ltr">{t("reverses", { id: entry.reverses_id.slice(0, 8) })}</span>
          ) : (
            <Link
              className="text-primary-dark hover:underline"
              href={entriesHref({ source_type: "journal_reversal", source_id: entry.id })}
              data-testid="entry-reversal-link"
            >
              {t("findReversal")}
            </Link>
          )}
        </div>
      ),
    },
  ];

  const selected = accounts.find((row) => row.code === (balance?.account as { code?: string } | undefined)?.code);

  return (
    <div className="flex flex-col gap-4">
      {balance ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="account-balance-card">
          <div>
            <p className="font-bold" dir="ltr">{String((balance.account as { code?: string })?.code ?? "")}</p>
            <p className="text-sm text-text-muted">{selected ? accountName(selected) : ""}</p>
          </div>
          <div className="text-end text-sm">
            <p className="text-lg font-bold" dir="ltr" data-testid="account-balance">{money(String(balance.balance ?? "0"))}</p>
            <p className="text-text-muted">
              {balance.as_of ? t("asOfDate", { date: String(balance.as_of) }) : t("asOfNow")}
            </p>
          </div>
        </Card>
      ) : null}
      <Alert tone="info">{t("readOnly")}</Alert>
      <DataTable
        testId="entries-table"
        caption={t("entriesTitle")}
        rows={entries.data ?? []}
        columns={columns}
        rowKey={(entry) => entry.id}
        state={state}
        emptyLabel={t("noEntries")}
        toolbar={
          <>
            <TableFilter
              name="account_code"
              label={t("filters.account")}
              options={[
                { value: "", label: t("filters.anyAccount") },
                ...accounts.map((row) => ({ value: row.code, label: `${row.code} · ${accountName(row)}` })),
              ]}
            />
            <TableFilter
              name="source_type"
              label={t("filters.source")}
              options={[
                { value: "", label: t("filters.anySource") },
                ...SOURCE_TYPES.map((type) => ({ value: type, label: t(`source.${type}`) })),
              ]}
            />
            <DateFilter name="from" label={t("filters.from")} />
            <DateFilter name="to" label={t("filters.to")} />
          </>
        }
      />
    </div>
  );
}
