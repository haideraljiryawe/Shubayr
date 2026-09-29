import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { periodRows, recentMonths } from "@/lib/finance/periods";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("periods") };
}

/** Accounting periods (ledger.view): the last twelve months and any closed before. */
export default async function PeriodsPage() {
  const t = await getTranslations("periods");
  const format = await getFormatter();
  const api = await serverApi();
  const periods = await load(api.GET("/admin/accounting-periods"));
  if (!periods.ok) return <PageError error={periods.error} />;
  const rows = periodRows(periods.data, recentMonths(storeDay(), 12));
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : "—";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="overflow-x-auto p-5">
        <table className="w-full text-sm" data-testid="periods-table">
          <thead className="text-text-muted">
            <tr>
              <th className="py-1 text-start font-semibold">{t("columns.month")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.status")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.closedAt")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.reopened")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.closes")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-t border-border" data-testid="period-row" data-month={row.month} data-status={row.status}>
                <td className="py-2">
                  <Link href={`/finance/periods/${row.month}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                    {row.month}
                  </Link>
                </td>
                <td className="py-2">
                  <Badge tone={row.status === "closed" ? "neutral" : "success"}>{t(`status.${row.status}`)}</Badge>
                </td>
                <td className="py-2">{row.status === "closed" ? when(row.closedAt) : "—"}</td>
                <td className="py-2">
                  {row.reopenedAt ? (
                    <>
                      {when(row.reopenedAt)}
                      <span className="block text-xs text-text-muted">{row.reopenReason}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2">{row.closes.length || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
