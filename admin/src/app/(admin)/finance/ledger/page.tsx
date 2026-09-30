import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import type { RawSearchParams } from "@/lib/table-params";
import { TrialBalanceView } from "./trial-balance-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("ledger") };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Trial balance "as of" a date (ledger.view), read-only. */
export default async function LedgerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("ledger");
  const raw = (await searchParams).as_of;
  const asOf = typeof raw === "string" && DAY.test(raw) ? raw : undefined;
  const api = await serverApi();
  const [balance, currencies] = await Promise.all([
    load(api.GET("/admin/ledger/trial-balance", { params: { query: asOf ? { as_of: asOf } : {} } })),
    load(api.GET("/admin/currencies")),
  ]);
  if (!balance.ok) return <PageError error={balance.error} />;
  const base = currencies.ok ? currencies.data.find((currency) => currency.is_base) : undefined;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TrialBalanceView balance={balance.data} asOf={asOf ?? null} precision={base?.display_precision ?? 0} />
    </>
  );
}
