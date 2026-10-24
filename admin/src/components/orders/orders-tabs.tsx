import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ORDER_QUEUES, type OrderQueue } from "@/lib/orders";
import { TabStrip, TabLink } from "@/components/ui/tab-strip";

type View = "list" | "board" | "retrievals" | "collections";

/**
 * The orders area: every order, the three server-filtered work queues (each
 * with the API's count), the status board, the retrieval documents, and the
 * deliveries whose cash is not confirmed yet.
 */
export function OrdersTabs({
  active,
  queue = null,
  counts,
  canViewRetrievals = false,
  canViewCollections = false,
}: {
  active: View;
  queue?: OrderQueue | null;
  counts?: Record<OrderQueue, number | null>;
  canViewRetrievals?: boolean;
  canViewCollections?: boolean;
}) {
  const t = useTranslations("orders.views");
  const tab = (key: string, href: string, label: string, current: boolean, count?: number | null) => (
    <TabLink
      key={key}
      href={href}
      current={current}
      data-testid={`orders-tab-${key}`}
    >
      {label}
      {count !== undefined && count !== null ? (
        <span
          className={cn("rounded-full px-2 py-0.5 text-caption", count > 0 ? "bg-warning/20 text-text" : "bg-card text-text-muted")}
          data-testid={`orders-queue-count-${key}`}
        >
          {count}
        </span>
      ) : null}
    </TabLink>
  );
  return (
    <TabStrip label={t("label")}>
      {tab("list", "/orders", t("list"), active === "list" && queue === null)}
      {ORDER_QUEUES.map((key) => tab(key, `/orders?queue=${key}`, t(`queues.${key}`), active === "list" && queue === key, counts?.[key]))}
      {tab("board", "/orders/board", t("board"), active === "board")}
      {canViewRetrievals ? tab("retrievals", "/retrievals", t("retrievals"), active === "retrievals") : null}
      {canViewCollections ? tab("collections", "/deliveries/unconfirmed", t("collections"), active === "collections") : null}
    </TabStrip>
  );
}
