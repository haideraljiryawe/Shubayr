import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { AGING_BUCKETS, agingTotals, moneyText, precisionOf, toFixed, type AgingBucket, type CurrencyCode } from "@/lib/purchasing";
import type { RawSearchParams } from "@/lib/table-params";
import { AsOfFilter } from "./as-of-filter";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("payables") };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface AgingLine {
  supplier: { id: string; name: string };
  invoice_id: string;
  document_number: string;
  due_date: string | null;
  currency_code: CurrencyCode;
  remaining: number;
  remaining_iqd: number;
  bucket: AgingBucket;
}

/**
 * Payables (suppliers.view): what is owed to each supplier in its currency
 * and in IQD, and accounts-payable aging by due date as of a day — current,
 * 1–30, 31–60, 61–90 and over 90 days. Both reports come whole from the API
 * (it does not page them).
 */
export default async function PayablesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.reports");
  const locale = await getLocale();
  const raw = await searchParams;
  const asOf = typeof raw.as_of === "string" && DAY.test(raw.as_of) ? raw.as_of : storeDay();
  const api = await serverApi();
  const [balances, aging] = await Promise.all([
    load(api.GET("/admin/suppliers/balances")),
    load(api.GET("/admin/suppliers/aging", { params: { query: { as_of: asOf } } })),
  ]);
  if (!balances.ok) return <PageError error={balances.error} />;
  const money = (value: bigint, code: string) => moneyText(value, code, precisionOf(code), locale);
  const lines = aging.ok ? (aging.data as unknown as AgingLine[]) : [];
  const totals = agingTotals(lines);
  const bySupplier = new Map<string, { name: string; buckets: Map<AgingBucket, bigint>; total: bigint }>();
  for (const line of lines) {
    const entry = bySupplier.get(line.supplier.id) ?? { name: line.supplier.name, buckets: new Map(), total: 0n };
    const value = toFixed(line.remaining_iqd);
    entry.buckets.set(line.bucket, (entry.buckets.get(line.bucket) ?? 0n) + value);
    entry.total += value;
    bySupplier.set(line.supplier.id, entry);
  }
  const balanceTotal = balances.data.reduce((sum, row) => sum + toFixed(row.balance_iqd), 0n);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <Card className="overflow-x-auto" data-testid="supplier-balances">
          <h2 className="mb-3 text-lg font-bold">{t("balances")}</h2>
          {balances.data.length === 0 ? (
            <p className="text-sm text-text-muted">{t("noBalances")}</p>
          ) : (
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("columns.supplier")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("columns.balance")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("columns.balanceIqd")}</th>
                </tr>
              </thead>
              <tbody>
                {balances.data.map((row) => (
                  <tr key={`${row.supplier.id}:${row.currency_code}`} className="border-t border-border" data-testid="balance-row" data-supplier={row.supplier.name}>
                    <td className="px-3 py-2">
                      <Link href={`/purchasing/suppliers/${row.supplier.id}`} className="font-semibold text-primary-dark hover:underline">
                        {row.supplier.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="balance-currency">{money(toFixed(row.balance_currency), row.currency_code)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{money(toFixed(row.balance_iqd), "IQD")}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-bold">
                  <td className="px-3 py-2">{t("total")}</td>
                  <td />
                  <td className="px-3 py-2 text-end" dir="ltr">{money(balanceTotal, "IQD")}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        <Card className="overflow-x-auto" data-testid="ap-aging">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{t("aging")}</h2>
              <p className="text-sm text-text-muted">{t("agingBody")}</p>
            </div>
            <AsOfFilter value={asOf} />
          </div>
          {!aging.ok ? (
            <p className="text-sm text-text-muted">{t("agingUnavailable")}</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-text-muted">{t("noAging")}</p>
          ) : (
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("columns.supplier")}</th>
                  {AGING_BUCKETS.map((bucket) => (
                    <th key={bucket} className="px-3 py-2 text-end font-semibold">
                      {t(`buckets.${bucket}`)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-end font-semibold">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {[...bySupplier.entries()].map(([id, entry]) => (
                  <tr key={id} className="border-t border-border" data-testid="aging-row" data-supplier={entry.name}>
                    <td className="px-3 py-2">
                      <Link href={`/purchasing/suppliers/${id}`} className="font-semibold text-primary-dark hover:underline">
                        {entry.name}
                      </Link>
                    </td>
                    {AGING_BUCKETS.map((bucket) => (
                      <td key={bucket} className="px-3 py-2 text-end" dir="ltr" data-testid={`aging-${bucket}`}>
                        {entry.buckets.get(bucket) ? money(entry.buckets.get(bucket)!, "IQD") : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr">{money(entry.total, "IQD")}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-bold">
                  <td className="px-3 py-2">{t("total")}</td>
                  {AGING_BUCKETS.map((bucket) => (
                    <td key={bucket} className="px-3 py-2 text-end" dir="ltr">
                      {money(totals.byBucket.get(bucket) ?? 0n, "IQD")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-end" dir="ltr">{money(totals.totalIqd, "IQD")}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
