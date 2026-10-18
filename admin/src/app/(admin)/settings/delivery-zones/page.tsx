import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { ZonesView } from "./zones-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("deliveryZones");
  return { title: t("title") };
}

/** Delivery zones and the governorates each one serves (delivery_zones.manage). */
export default async function DeliveryZonesPage() {
  const t = await getTranslations("deliveryZones");
  const api = await serverApi();
  const [zones, governorates, permissions] = await Promise.all([
    load(api.GET("/admin/delivery-zones")),
    load(api.GET("/admin/governorates")),
    loadPermissions(api),
  ]);
  if (!zones.ok) return <PageError error={zones.error} />;
  if (!governorates.ok) return <PageError error={governorates.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsTabs active="zones" permissions={permissions} />
      <ZonesView zones={zones.data} governorates={governorates.data} />
    </>
  );
}
