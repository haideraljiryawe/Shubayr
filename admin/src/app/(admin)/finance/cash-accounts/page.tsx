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

/** Cash and bank accounts (cash_accounts.view), balances from the ledger. */
export default async function CashAccountsPage() {
  const t = await getTranslations("cashAccounts");
  const api = await serverApi();
  const [accounts, currencies, me] = await Promise.all([
    load(api.GET("/admin/cash-accounts")),
    load(api.GET("/admin/currencies")),
    load(api.GET("/me")),
  ]);
  if (!accounts.ok) return <PageError error={accounts.error} />;

  // Currencies need fx_rates.view; without it, fall back to the currencies the
  // accounts already use, with the display precision the API reports for them.
  const known = currencies.ok
    ? currencies.data.map((currency) => ({
        code: currency.code,
        precision: currency.display_precision,
        enabled: currency.enabled,
        isBase: currency.is_base,
      }))
    : [...new Map(
        accounts.data.map((account) => [
          account.currency_code,
          {
            code: account.currency_code,
            precision: account.currency.display_precision,
            enabled: account.currency.enabled,
            isBase: account.currency_code === account.base_currency_code,
          },
        ]),
      ).values()];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CashAccountsView
        accounts={accounts.data}
        currencies={known}
        canManage={me.ok && (me.data.permissions ?? []).includes("cash_accounts.manage")}
      />
    </>
  );
}
