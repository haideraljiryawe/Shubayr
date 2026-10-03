import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { OrderFlags } from "@/components/orders/order-flags";
import { OrdersTabs } from "@/components/orders/orders-tabs";
import { load, serverApi } from "@/lib/api/server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { queueCounts } from "@/lib/api/orders-server";
import { formatMoney, type OrderStatus } from "@/lib/orders";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

/** The lifecycle columns, left to right as an order moves through them. */
const COLUMNS: readonly OrderStatus[] = ["pending", "confirmed", "preparing", "ready_for_dispatch", "dispatched", "failed"];
const PER_COLUMN = 10;

/**
 * Open orders by lifecycle status (orders.view): one server query per
 * column (GET /admin/orders?status=…), newest first, each with its count
 * and a link to the full filtered list. Late, short and cancellation-
 * requested orders are flagged on their cards.
 */
export default async function OrdersBoardPage() {
  const t = await getTranslations("orders");
  const locale = await getLocale();
  const api = await serverApi();
  const [permissions, settings, ...columns] = await Promise.all([
    loadPermissions(api),
    load(api.GET("/settings")),
    ...COLUMNS.map((status) => load(api.GET("/admin/orders", { params: { query: { status, page: 1, per_page: PER_COLUMN } } }))),
  ]);
  const failed = columns.find((column) => !column.ok);
  if (failed && !failed.ok) return <PageError error={failed.error} />;
  const storeCurrency = settings.ok ? (settings.data.currency ?? "IQD") : "IQD";

  return (
    <>
      <PageHeader title={t("title")} description={t("boardDescription")} />
      <OrdersTabs active="board" counts={columns[0]?.ok ? queueCounts(columns[0].data.badge_counts) : undefined} canViewRetrievals={permissions.includes("retrieval.view")} />
      <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6" data-testid="orders-board">
        {COLUMNS.map((status, index) => {
          const column = columns[index]!;
          const page = column.ok ? column.data : null;
          return (
            <section key={status} className="flex min-w-56 flex-col gap-2" data-testid="board-column" data-status={status}>
              <h2 className="flex items-center justify-between text-sm font-bold">
                <span>{t(`status.${status}`)}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs" data-testid="board-count">{page?.total ?? 0}</span>
              </h2>
              {(page?.data ?? []).map((order) => (
                <Card key={order.id} className="flex flex-col gap-1 p-3" data-testid="board-card" data-order-number={order.order_number}>
                  <Link href={`/orders/${order.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                    {order.order_number}
                  </Link>
                  <span className="text-xs text-text-muted">{order.customer?.name || order.customer?.phone}</span>
                  <span className="text-xs" dir="ltr">{formatMoney(order.total, order.currency ?? storeCurrency, locale)}</span>
                  <div className="flex flex-wrap gap-1">
                    <OrderFlags order={order} />
                  </div>
                </Card>
              ))}
              {page && page.total > PER_COLUMN ? (
                <Link href={`/orders?status=${status}`} className="text-xs font-semibold text-primary-dark hover:underline">
                  {t("board.more", { count: page.total - PER_COLUMN })}
                </Link>
              ) : null}
              {page && page.total === 0 ? <p className="text-xs text-text-muted">{t("board.empty")}</p> : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
