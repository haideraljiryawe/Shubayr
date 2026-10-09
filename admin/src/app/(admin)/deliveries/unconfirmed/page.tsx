import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { OrdersTabs } from "@/components/orders/orders-tabs";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadQueueCounts } from "@/lib/api/orders-server";
import { load, serverApi } from "@/lib/api/server";
import { collectionListQuery, QUEUE_FILTER_KEYS } from "@/lib/collection";
import { loadPartyChoice } from "@/lib/api/parties-server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { UnconfirmedView } from "./unconfirmed-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collections.queue");
  return { title: t("title") };
}

/**
 * Delivered orders whose cash is not confirmed yet (deliveries.manage,
 * contract 12.0), oldest first and paged by the server, filtered by party,
 * delivery day and amount due (13.1). Each is confirmed later with the amount
 * handed in — the full amount, or less (a shortfall) — by someone with
 * orders.deliver.
 */
export default async function UnconfirmedCollectionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("collections.queue");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["delivered_at"],
    defaultSort: "delivered_at",
    filterKeys: QUEUE_FILTER_KEYS,
  });
  const api = await serverApi();
  const { query: filtered, ignored } = collectionListQuery(params.filters, params.page, params.perPage);
  // Oldest first, as the queue says (the API defaults to newest first since 13.4).
  const query = (page: number) => ({ ...filtered, page, sort_by: "date" as const, sort_direction: "asc" as const });
  const [first, permissions, party] = await Promise.all([
    load(api.GET("/admin/deliveries/unconfirmed", { params: { query: query(params.page) } })),
    loadPermissions(api),
    loadPartyChoice(api, params.filters.party_id),
  ]);
  let page = first;
  if (page.ok && page.data.data.length === 0 && page.data.total > 0 && params.page > 1) {
    page = await load(api.GET("/admin/deliveries/unconfirmed", { params: { query: query(lastPage(page.data.total, params.perPage)) } }));
  }
  if (!page.ok) return <PageError error={page.error} />;
  const counts = permissions.includes("orders.view") ? await loadQueueCounts(api) : undefined;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {permissions.includes("orders.view") ? (
        <OrdersTabs active="collections" counts={counts} canViewRetrievals={permissions.includes("retrieval.view")} canViewCollections />
      ) : null}
      <UnconfirmedView
        rows={page.data.data}
        state={{ page: page.data.page, perPage: page.data.per_page, total: page.data.total, sort: "delivered_at", dir: "asc" }}
        canConfirm={permissions.includes("orders.deliver")}
        party={party}
        ignored={ignored}
      />
    </>
  );
}
