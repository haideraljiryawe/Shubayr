import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** The two ways into stock: lot/location balances, and per-SKU availability. */
export function StockTabs({ active, canBySku }: { active: "lots" | "skus"; canBySku: boolean }) {
  const t = useTranslations("inventory.stock");
  const tabs = [
    { key: "lots" as const, href: "/inventory/stock", label: t("tabLots") },
    ...(canBySku ? [{ key: "skus" as const, href: "/inventory/stock/skus", label: t("tabSkus") }] : []),
  ];
  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label={t("tabsLabel")}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          data-testid={`stock-tab-${tab.key}`}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm font-semibold",
            tab.key === active ? "border-primary-dark text-primary-dark" : "border-transparent text-text-muted hover:text-text",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
