import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { OrdersTabs } from "@/components/orders/orders-tabs";
import { loadPermissions } from "@/lib/api/inventory-server";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { isOrderQueue, orderListQuery } from "@/lib/orders";
import { queueCounts } from "@/lib/api/orders-server";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { OrdersTable } from "./orders-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

/**
 * Every order, filtered and paged by the SERVER: the URL carries status,
 * search, date range and page, and they go straight into GET /admin/orders.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("orders");
  const raw = await searchParams;
  // A work queue (late, needs attention, cancellation requests) is filtered
  // by the server, like status and dates.
  const queue = isOrderQueue(raw.queue) ? raw.queue : null;
  const params = parseTableParams(raw, {
    sortKeys: ["placed_at"],
    defaultSort: "placed_at",
    defaultDir: "desc",
    filterKeys: ["status", "from", "to"],
  });
  const { query, invalidRange } = orderListQuery({
    status: params.filters.status,
    queue: queue ?? undefined,
    q: params.q,
    from: params.filters.from,
    to: params.filters.to,
    page: params.page,
    perPage: params.perPage,
  });

  const api = await serverApi();
  const [orders, settings, permissions] = await Promise.all([
    load(api.GET("/admin/orders", { params: { query } })),
    load(api.GET("/settings")),
    loadPermissions(api),
  ]);
  if (!orders.ok) return <PageError error={orders.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <OrdersTabs active="list" queue={queue} counts={queueCounts(orders.data.badge_counts)} canViewRetrievals={permissions.includes("retrieval.view")} />
      <OrdersTable
        rows={orders.data.data ?? []}
        state={{
          page: orders.data.page,
          perPage: orders.data.per_page,
          total: orders.data.total,
          sort: "placed_at",
          dir: "desc",
        }}
        currency={settings.ok ? (settings.data.currency ?? "USD") : "USD"}
        invalidRange={invalidRange}
        canPick={permissions.includes("inventory.pick")}
      />
    </>
  );
}
