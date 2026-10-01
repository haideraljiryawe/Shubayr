import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { CurrenciesView } from "./currencies-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("currencies") };
}

/**
 * Currencies and exchange rates (ledger.view to read). Enabling a currency
 * needs settings.manage and recording a rate fx_rates.update; the page offers
 * each control only to those who hold its permission, and the API decides.
 */
export default async function CurrenciesPage() {
  const t = await getTranslations("currencies");
  const api = await serverApi();
  const [currencies, rates, me] = await Promise.all([
    load(api.GET("/admin/currencies")),
    load(api.GET("/admin/exchange-rates")),
    load(api.GET("/me")),
  ]);
  if (!currencies.ok) return <PageError error={currencies.error} />;
  if (!rates.ok) return <PageError error={rates.error} />;
  const permissions = me.ok ? (me.data.permissions ?? []) : [];

  // Who set each rate: the rate carries only a user id; the audit log has
  // the name, for staff allowed to read it. A rate is recorded directly
  // (exchange_rate.create) or through the linked-price flow as "rate only"
  // (exchange_rate.save_only); both are audited against the rate itself.
  const authors: Record<string, string> = {};
  if (permissions.includes("audit.view")) {
    const audit = await load(
      api.GET("/admin/audit-logs", {
        params: { query: { entity_type: "exchange_rate", per_page: 100 } },
      }),
    );
    if (audit.ok) {
      for (const row of audit.data.data ?? []) {
        if (row.entity_id) authors[row.entity_id] = row.actor?.name || row.actor?.username || "";
      }
    }
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CurrenciesView
        currencies={currencies.data}
        rates={rates.data}
        authors={authors}
        canToggle={permissions.includes("settings.manage")}
        canRate={permissions.includes("fx_rates.update")}
        canPublish={permissions.includes("prices.publish_linked")}
      />
    </>
  );
}
