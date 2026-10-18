import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { TiersView } from "./tiers-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discountTiers");
  return { title: t("title") };
}

/**
 * Automatic order discounts (discount_tiers.manage). Whether a tier stacks
 * with a coupon is the store setting `discount_tier_coupon_stacking_enabled`
 * (off by default): read when the person may read settings, else the default
 * is described.
 */
export default async function DiscountTiersPage() {
  const t = await getTranslations("discountTiers");
  const api = await serverApi();
  const [tiers, permissions] = await Promise.all([load(api.GET("/admin/discount-tiers")), loadPermissions(api)]);
  if (!tiers.ok) return <PageError error={tiers.error} />;
  const settings = permissions.includes("settings.manage") ? await load(api.GET("/admin/settings")) : null;
  const raw = settings?.ok ? (settings.data.settings as Record<string, unknown> | undefined)?.discount_tier_coupon_stacking_enabled : undefined;
  const stacking = raw === true || raw === "true";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsTabs active="discounts" permissions={permissions} />
      <TiersView tiers={tiers.data} stacking={stacking} />
    </>
  );
}
