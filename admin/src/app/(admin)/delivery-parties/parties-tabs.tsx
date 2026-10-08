import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** Every party, and the custody each one holds right now (deliveries.manage). */
export function PartiesTabs({ active }: { active: "parties" | "custody" }) {
  const t = useTranslations("parties.listTabs");
  const tab = (key: "parties" | "custody", href: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      data-testid={`parties-tab-${key}`}
      className={cn(
        "-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold",
        active === key ? "border-primary-dark text-primary-dark" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {t(key)}
    </Link>
  );
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("label")}>
      {tab("parties", "/delivery-parties")}
      {tab("custody", "/delivery-parties/custody")}
    </nav>
  );
}
