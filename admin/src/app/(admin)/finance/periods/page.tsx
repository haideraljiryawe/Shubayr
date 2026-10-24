import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { periodRows, recentMonths } from "@/lib/finance/periods";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

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
        <Table data-testid="periods-table">
          <THead>
            <Tr>
              <Th>{t("columns.month")}</Th>
              <Th>{t("columns.status")}</Th>
              <Th>{t("columns.closedAt")}</Th>
              <Th>{t("columns.reopened")}</Th>
              <Th>{t("columns.closes")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.month} data-testid="period-row" data-month={row.month} data-status={row.status}>
                <Td>
                  <Link href={`/finance/periods/${row.month}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                    {row.month}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={row.status === "closed" ? "neutral" : "success"}>{t(`status.${row.status}`)}</Badge>
                </Td>
                <Td>{row.status === "closed" ? when(row.closedAt) : "—"}</Td>
                <Td>
                  {row.reopenedAt ? (
                    <>
                      {when(row.reopenedAt)}
                      <span className="block text-caption text-text-muted">{row.reopenReason}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{row.closes.length || "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
