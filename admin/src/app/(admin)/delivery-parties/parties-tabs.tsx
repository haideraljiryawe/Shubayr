import { useTranslations } from "next-intl";
import { TabStrip, TabLink } from "@/components/ui/tab-strip";

/** Every party, and the custody each one holds right now (deliveries.manage). */
export function PartiesTabs({ active }: { active: "parties" | "custody" }) {
  const t = useTranslations("parties.listTabs");
  const tab = (key: "parties" | "custody", href: string) => (
    <TabLink
      href={href}
      current={active === key}
      data-testid={`parties-tab-${key}`}
    >
      {t(key)}
    </TabLink>
  );
  return (
    <TabStrip label={t("label")}>
      {tab("parties", "/delivery-parties")}
      {tab("custody", "/delivery-parties/custody")}
    </TabStrip>
  );
}
