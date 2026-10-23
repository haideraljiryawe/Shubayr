import { useTranslations } from "next-intl";
import { TabStrip, TabLink } from "@/components/ui/tab-strip";

/** A party's custody (goods, cash, statement) and the collections for the orders they delivered. */
export function PartyTabs({ partyId, active }: { partyId: string; active: "custody" | "collections" }) {
  const t = useTranslations("parties.tabs");
  const tab = (key: "custody" | "collections", href: string) => (
    <TabLink
      href={href}
      current={active === key}
      data-testid={`party-tab-${key}`}
    >
      {t(key)}
    </TabLink>
  );
  return (
    <TabStrip label={t("label")}>
      {tab("custody", `/delivery-parties/${partyId}`)}
      {tab("collections", `/delivery-parties/${partyId}?tab=collections`)}
    </TabStrip>
  );
}
