"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { entryHref, sourceDocumentHref } from "@/lib/finance/links";
import { formatAmount } from "@/lib/finance/money";
import type { components } from "@/types/api";

type Entry = components["schemas"]["JournalEntry"];

export function EntryView({
  entry,
  baseCode,
  basePrecision,
  precisions,
}: {
  entry: Entry;
  baseCode: string;
  basePrecision: number;
  precisions: Record<string, number>;
}) {
  const t = useTranslations("ledger");
  const locale = useLocale();
  const format = useFormatter();
  const money = (value: string | number) => formatAmount(value, baseCode, basePrecision, locale);
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const source = t.has(`source.${entry.source_type}`) ? t(`source.${entry.source_type}`) : entry.source_type;
  const document = sourceDocumentHref(entry);
  const reversals = entry.reversals ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="entry-view">
      <PageHeader
        title={<span dir="ltr" data-testid="entry-number">{entry.document_number}</span>}
        description={source}
        actions={
          <Link className="text-sm text-primary-dark hover:underline" href="/finance/ledger/entries">
            {t("allEntries")}
          </Link>
        }
      />
      <Alert tone="info">{t("readOnly")}</Alert>

      <Card className="p-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Fact label={t("detail.accountingDate")} value={day(entry.accounting_date)} />
          <Fact label={t("detail.documentDate")} value={day(entry.document_date)} />
          <Fact label={t("detail.postedAt")} value={when(entry.posted_at)} />
          {entry.description ? <Fact label={t("detail.description")} value={entry.description} /> : null}
        </dl>
        <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm">
          {document ? (
            <Link className="text-primary-dark hover:underline" href={document} data-testid="entry-document-link">
              {t("openDocument")}
            </Link>
          ) : null}
          {entry.reverses ? (
            <p>
              <Badge tone="warning">{t("reversal")}</Badge>{" "}
              {t.rich("reversesEntry", {
                entry: () => (
                  <Link className="text-primary-dark hover:underline" href={entryHref(entry.reverses!.id)} dir="ltr" data-testid="entry-reverses">
                    {entry.reverses!.document_number}
                  </Link>
                ),
              })}
            </p>
          ) : null}
          {reversals.length ? (
            <p data-testid="entry-reversed">
              {t("reversedBy")}{" "}
              {reversals.map((link, index) => (
                <span key={link.id}>
                  {index ? ", " : null}
                  <Link className="text-primary-dark hover:underline" href={entryHref(link.id)} dir="ltr" data-testid="entry-reversed-by">
                    {link.document_number}
                  </Link>
                </span>
              ))}
            </p>
          ) : entry.reverses ? null : (
            <p className="text-text-muted" data-testid="entry-not-reversed">{t("notReversed")}</p>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto p-4">
        <table className="w-full text-sm" data-testid="entry-lines">
          <thead className="text-text-muted">
            <tr>
              <th className="py-1 text-start font-semibold">{t("columns.account")}</th>
              <th className="py-1 text-end font-semibold">{t("columns.debit")}</th>
              <th className="py-1 text-end font-semibold">{t("columns.credit")}</th>
              <th className="py-1 ps-3 text-start font-semibold">{t("detail.original")}</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id} className="border-t border-border" data-testid="entry-line">
                <td className="py-1.5">
                  <Link
                    href={`/finance/ledger/entries?account_code=${encodeURIComponent(line.account.code)}`}
                    className="text-primary-dark hover:underline"
                    dir="ltr"
                  >
                    {line.account.code}
                  </Link>{" "}
                  {locale === "ar" ? line.account.name_ar : line.account.name_en}
                  {line.memo ? <span className="block text-xs text-text-muted">{line.memo}</span> : null}
                </td>
                <td className="py-1.5 text-end" dir="ltr">{Number(line.debit_base) ? money(line.debit_base) : ""}</td>
                <td className="py-1.5 text-end" dir="ltr">{Number(line.credit_base) ? money(line.credit_base) : ""}</td>
                <td className="py-1.5 ps-3 text-text-muted" dir="ltr">
                  {line.currency_code !== baseCode
                    ? `${formatAmount(line.original_amount, line.currency_code, precisions[line.currency_code] ?? 2, locale)} × ${line.exchange_rate}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
