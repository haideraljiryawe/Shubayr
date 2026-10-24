import { useTranslations } from "next-intl";
import { TabStrip, TabLink } from "@/components/ui/tab-strip";

/** The two ways into stock: lot/location balances, and per-SKU availability. */
export function StockTabs({ active, canBySku }: { active: "lots" | "skus"; canBySku: boolean }) {
  const t = useTranslations("inventory.stock");
  const tabs = [
    { key: "lots" as const, href: "/inventory/stock", label: t("tabLots") },
    ...(canBySku ? [{ key: "skus" as const, href: "/inventory/stock/skus", label: t("tabSkus") }] : []),
  ];
  return (
    <TabStrip label={t("tabsLabel")}>
      {tabs.map((tab) => (
        <TabLink
          key={tab.key}
          href={tab.href}
          current={tab.key === active}
          data-testid={`stock-tab-${tab.key}`}
        >
          {tab.label}
        </TabLink>
      ))}
    </TabStrip>
  );
}
