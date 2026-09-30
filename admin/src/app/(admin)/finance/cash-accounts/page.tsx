import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { CashAccountsView } from "./cash-accounts-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("cashAccounts") };
}

/** Cash and bank accounts (cash_accounts.manage), balances from the ledger. */
export default async function CashAccountsPage() {
  const t = await getTranslations("cashAccounts");
  const api = await serverApi();
  const [accounts, currencies] = await Promise.all([
    load(api.GET("/admin/cash-accounts")),
    load(api.GET("/admin/currencies")),
  ]);
  if (!accounts.ok) return <PageError error={accounts.error} />;

  // Currencies need ledger.view; without it, fall back to the currencies the
  // accounts already use, with the display precision the API reports for them.
  const known = currencies.ok
    ? currencies.data.map((currency) => ({
        code: currency.code,
        precision: currency.display_precision,
        enabled: currency.enabled,
        isBase: currency.is_base,
      }))
    : [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CashAccountsView accounts={accounts.data} currencies={known} />
    </>
  );
}
