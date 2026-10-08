import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** A party's custody (goods, cash, statement) and the collections for the orders they delivered. */
export function PartyTabs({ partyId, active }: { partyId: string; active: "custody" | "collections" }) {
  const t = useTranslations("parties.tabs");
  const tab = (key: "custody" | "collections", href: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      data-testid={`party-tab-${key}`}
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
      {tab("custody", `/delivery-parties/${partyId}`)}
      {tab("collections", `/delivery-parties/${partyId}?tab=collections`)}
    </nav>
  );
}
