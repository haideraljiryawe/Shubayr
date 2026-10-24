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
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

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
          <h2 className="mb-3 text-section">{t("balances")}</h2>
          {balances.data.length === 0 ? (
            <p className="text-body text-text-muted">{t("noBalances")}</p>
          ) : (
            <Table minWidth="36rem">
              <THead>
                <Tr>
                  <Th>{t("columns.supplier")}</Th>
                  <Th>{t("columns.balance")}</Th>
                  <Th>{t("columns.balanceIqd")}</Th>
                </Tr>
              </THead>
              <TBody>
                {balances.data.map((row) => (
                  <Tr key={`${row.supplier.id}:${row.currency_code}`} data-testid="balance-row" data-supplier={row.supplier.name}>
                    <Td>
                      <Link href={`/purchasing/suppliers/${row.supplier.id}`} className="font-semibold text-primary-dark hover:underline">
                        {row.supplier.name}
                      </Link>
                    </Td>
                    <Td dir="ltr" data-testid="balance-currency">{money(toFixed(row.balance_currency), row.currency_code)}</Td>
                    <Td dir="ltr">{money(toFixed(row.balance_iqd), "IQD")}</Td>
                  </Tr>
                ))}
                <Tr className="border-t-2 font-bold">
                  <Td>{t("total")}</Td>
                  <Td />
                  <Td dir="ltr">{money(balanceTotal, "IQD")}</Td>
                </Tr>
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="overflow-x-auto" data-testid="ap-aging">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-section">{t("aging")}</h2>
              <p className="text-body text-text-muted">{t("agingBody")}</p>
            </div>
            <AsOfFilter value={asOf} />
          </div>
          {!aging.ok ? (
            <p className="text-body text-text-muted">{t("agingUnavailable")}</p>
          ) : lines.length === 0 ? (
            <p className="text-body text-text-muted">{t("noAging")}</p>
          ) : (
            <Table minWidth="56rem">
              <THead>
                <Tr>
                  <Th>{t("columns.supplier")}</Th>
                  {AGING_BUCKETS.map((bucket) => (
                    <Th key={bucket}>
                      {t(`buckets.${bucket}`)}
                    </Th>
                  ))}
                  <Th>{t("total")}</Th>
                </Tr>
              </THead>
              <TBody>
                {[...bySupplier.entries()].map(([id, entry]) => (
                  <Tr key={id} data-testid="aging-row" data-supplier={entry.name}>
                    <Td>
                      <Link href={`/purchasing/suppliers/${id}`} className="font-semibold text-primary-dark hover:underline">
                        {entry.name}
                      </Link>
                    </Td>
                    {AGING_BUCKETS.map((bucket) => (
                      <Td key={bucket} dir="ltr" data-testid={`aging-${bucket}`}>
                        {entry.buckets.get(bucket) ? money(entry.buckets.get(bucket)!, "IQD") : "—"}
                      </Td>
                    ))}
                    <Td className="font-semibold" dir="ltr">{money(entry.total, "IQD")}</Td>
                  </Tr>
                ))}
                <Tr className="border-t-2 font-bold">
                  <Td>{t("total")}</Td>
                  {AGING_BUCKETS.map((bucket) => (
                    <Td key={bucket} dir="ltr">
                      {money(totals.byBucket.get(bucket) ?? 0n, "IQD")}
                    </Td>
                  ))}
                  <Td dir="ltr">{money(totals.totalIqd, "IQD")}</Td>
                </Tr>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
