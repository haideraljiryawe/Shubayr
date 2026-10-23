import { useTranslations } from "next-intl";
import { TabStrip, TabLink } from "@/components/ui/tab-strip";

export type SettingsView = "store" | "storeInfo" | "zones" | "governorates" | "discounts";

const TABS: ReadonlyArray<{ key: SettingsView; href: string; requires: string }> = [
  { key: "store", href: "/settings", requires: "settings.manage" },
  // The public legal, contact and policy details (contract 17.2).
  { key: "storeInfo", href: "/settings/store-info", requires: "settings.manage" },
  { key: "zones", href: "/settings/delivery-zones", requires: "delivery_zones.manage" },
  { key: "governorates", href: "/settings/governorates", requires: "delivery_zones.manage" },
  { key: "discounts", href: "/settings/discounts", requires: "discount_tiers.manage" },
];

/**
 * The settings area: store settings, the store's public info, delivery zones and the governorates
 * they cover, and automatic discounts — each tab only for the staff whose
 * permissions open it (the API still decides every call).
 */
export function SettingsTabs({ active, permissions }: { active: SettingsView; permissions: readonly string[] }) {
  const t = useTranslations("settingsTabs");
  const visible = TABS.filter((tab) => permissions.includes(tab.requires));
  if (visible.length < 2) return null;
  return (
    <TabStrip label={t("label")}>
      {visible.map((tab) => (
        <TabLink
          key={tab.key}
          href={tab.href}
          current={tab.key === active}
          data-testid={`settings-tab-${tab.key}`}
        >
          {t(tab.key)}
        </TabLink>
      ))}
    </TabStrip>
  );
}
