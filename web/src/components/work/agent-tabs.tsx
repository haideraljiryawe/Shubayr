"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "deliveries", href: "/deliveries" },
  { key: "custody", href: "/deliveries/custody" },
] as const;

/** The delivery agent's two pages: their deliveries and what they hold. */
export function AgentTabs({
  active,
}: {
  active: (typeof TABS)[number]["key"];
}) {
  const t = useTranslations("custody.tabs");
  return (
    <nav
      aria-label={t("label")}
      className="flex gap-2 border-b border-border"
      data-testid="agent-tabs"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          data-testid={`agent-tab-${tab.key}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
            active === tab.key
              ? "border-primary text-primary-dark"
              : "border-transparent text-text-muted hover:text-text",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
