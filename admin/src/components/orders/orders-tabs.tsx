import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** The orders list and the status board: two views of the same orders. */
export function OrdersTabs({ active }: { active: "list" | "board" }) {
  const t = useTranslations("orders.views");
  const tabs = [
    { key: "list" as const, href: "/orders", label: t("list") },
    { key: "board" as const, href: "/orders/board", label: t("board") },
  ];
  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label={t("label")}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          data-testid={`orders-tab-${tab.key}`}
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
