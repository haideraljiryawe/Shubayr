import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { MONTH, periodRows } from "@/lib/finance/periods";
import { PeriodView } from "./period-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("periods") };
}

/**
 * One month: its state, the API's close checklist (period.close), close and
 * reopen, and every close so far with the differences each re-close found.
 */
export default async function PeriodPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!MONTH.test(month)) notFound();
  const api = await serverApi();
  const [periods, me] = await Promise.all([
    load(api.GET("/admin/accounting-periods")),
    load(api.GET("/me")),
  ]);
  if (!periods.ok) return <PageError error={periods.error} />;
  const permissions = me.ok ? (me.data.permissions ?? []) : [];
  const row = periodRows(periods.data, [month]).find((candidate) => candidate.month === month)!;

  const checklist = permissions.includes("period.close")
    ? await load(
        api.GET("/admin/accounting-periods/{month}/checklist", { params: { path: { month } } }),
      )
    : null;

  return (
    <PeriodView
      period={row}
      checklist={checklist?.ok ? checklist.data : null}
      canClose={permissions.includes("period.close")}
      canReopen={permissions.includes("period.reopen")}
      isFuture={month > storeDay().slice(0, 7)}
    />
  );
}
