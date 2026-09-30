import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { SettingsForm, type SettingsAudit } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}

/**
 * Store settings (settings.manage). The change history comes from the audit
 * log, so it shows only to staff who also hold audit.view; the API records
 * every save with its before and after regardless.
 */
export default async function SettingsPage() {
  const t = await getTranslations("financeSettings");
  const api = await serverApi();
  const [settings, me, currencies] = await Promise.all([
    load(api.GET("/admin/settings")),
    load(api.GET("/me")),
    load(api.GET("/admin/currencies")),
  ]);
  if (!settings.ok) return <PageError error={settings.error} />;

  const permissions = me.ok ? (me.data.permissions ?? []) : [];
  let history: SettingsAudit[] | null = null;
  if (permissions.includes("audit.view")) {
    const audit = await load(
      api.GET("/admin/audit-logs", {
        params: { query: { entity_type: "settings", action: "settings.update", per_page: 10 } },
      }),
    );
    if (audit.ok) {
      history = (audit.data.data ?? []).map((row) => ({
        id: row.id,
        at: row.created_at,
        actor: row.actor?.name || row.actor?.username || null,
        before: row.before,
        after: row.after,
      }));
    }
  }
  const base = currencies.ok ? currencies.data.find((currency) => currency.is_base) : undefined;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsForm
        settings={settings.data}
        baseCurrency={base?.code ?? settings.data.settings?.currency ?? "IQD"}
        basePrecision={base?.display_precision ?? 0}
        history={history}
      />
    </>
  );
}
