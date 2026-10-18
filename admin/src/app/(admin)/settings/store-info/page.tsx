import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { load, serverApi } from "@/lib/api/server";
import { StoreInfoForm } from "./store-info-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("storeInfo");
  return { title: t("title") };
}

/**
 * Store info (settings.manage, contract 17.2): the legal name, address,
 * contacts, support hours and return/refund policy the store and the apps
 * show publicly. The owner fills them in here; until then the store hides
 * each missing line.
 */
export default async function StoreInfoPage() {
  const t = await getTranslations("storeInfo");
  const api = await serverApi();
  const [settings, me] = await Promise.all([load(api.GET("/admin/settings")), load(api.GET("/me"))]);
  if (!settings.ok) return <PageError error={settings.error} />;
  const permissions = me.ok ? (me.data.permissions ?? []) : [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsTabs active="storeInfo" permissions={permissions} />
      <StoreInfoForm settings={settings.data} />
    </>
  );
}
