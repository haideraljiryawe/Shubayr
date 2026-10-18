import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { GovernoratesView } from "./governorates-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("governorates");
  return { title: t("title") };
}

/** Iraq's governorates: names in both languages and whether customers may choose them. */
export default async function GovernoratesPage() {
  const t = await getTranslations("governorates");
  const api = await serverApi();
  const [governorates, permissions] = await Promise.all([load(api.GET("/admin/governorates")), loadPermissions(api)]);
  if (!governorates.ok) return <PageError error={governorates.error} />;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsTabs active="governorates" permissions={permissions} />
      <GovernoratesView governorates={governorates.data} />
    </>
  );
}
