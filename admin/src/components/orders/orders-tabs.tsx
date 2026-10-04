import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ORDER_QUEUES, type OrderQueue } from "@/lib/orders";

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
    <Link
      key={key}
      href={href}
      aria-current={current ? "page" : undefined}
      data-testid={`orders-tab-${key}`}
      className={cn(
        "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold",
        current ? "border-primary-dark text-primary-dark" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {label}
      {count !== undefined && count !== null ? (
        <span
          className={cn("rounded-full px-2 py-0.5 text-xs", count > 0 ? "bg-warning/20 text-text" : "bg-card text-text-muted")}
          data-testid={`orders-queue-count-${key}`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("label")}>
      {tab("list", "/orders", t("list"), active === "list" && queue === null)}
      {ORDER_QUEUES.map((key) => tab(key, `/orders?queue=${key}`, t(`queues.${key}`), active === "list" && queue === key, counts?.[key]))}
      {tab("board", "/orders/board", t("board"), active === "board")}
      {canViewRetrievals ? tab("retrievals", "/retrievals", t("retrievals"), active === "retrievals") : null}
      {canViewCollections ? tab("collections", "/deliveries/unconfirmed", t("collections"), active === "collections") : null}
    </nav>
  );
}
