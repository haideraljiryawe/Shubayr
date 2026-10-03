import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { OrdersTabs } from "@/components/orders/orders-tabs";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadQueueCounts } from "@/lib/api/orders-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { UUID } from "@/lib/inventory";
import { retrievalListQuery } from "@/lib/retrievals";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { RetrievalsTable } from "./retrievals-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("retrievals.list");
  return { title: t("title") };
}

/**
 * Every retrieval document across all orders (retrieval.view, contract 11.0),
 * filtered and paged by the server: by custody party, order, document date
 * and status.
 */
export default async function RetrievalsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("retrievals.list");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["document_date"],
    defaultSort: "document_date",
    defaultDir: "desc",
    filterKeys: ["party_id", "order_id", "status", "from", "to"],
  });
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  const query = (page: number) => retrievalListQuery(params.filters, page, params.perPage);
  // Internal agents and external drivers (contract 11.2).
  const canListParties = ["deliveries.manage", "orders.assign_agent", "drivers.manage"].some((key) => permissions.includes(key));
  const [first, counts, parties] = await Promise.all([
    load(api.GET("/admin/retrievals", { params: { query: query(params.page) } })),
    permissions.includes("orders.view") ? loadQueueCounts(api) : Promise.resolve(undefined),
    canListParties ? load(api.GET("/admin/delivery-parties", { params: { query: { per_page: 100 } } })) : Promise.resolve(null),
  ]);
  let page = first;
  if (page.ok && page.data.data.length === 0 && page.data.total > 0 && params.page > 1) {
    page = await load(api.GET("/admin/retrievals", { params: { query: query(lastPage(page.data.total, params.perPage)) } }));
  }
  if (!page.ok) return <PageError error={page.error} />;
  const orderId = params.filters.order_id && UUID.test(params.filters.order_id) ? params.filters.order_id : null;
  const orderNumber = orderId ? (page.data.data.find((row) => row.order_id === orderId)?.order.order_number ?? null) : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {permissions.includes("orders.view") ? <OrdersTabs active="retrievals" counts={counts} canViewRetrievals /> : null}
      {orderId ? (
        <p className="mb-3 text-sm" data-testid="retrievals-order-filter">
          {t("forOrder", { number: orderNumber ?? "…" })}{" "}
          <Link href="/retrievals" className="font-semibold text-primary-dark hover:underline">
            {t("allOrders")}
          </Link>
        </p>
      ) : null}
      <RetrievalsTable
        rows={page.data.data}
        state={{ page: page.data.page, perPage: page.data.per_page, total: page.data.total, sort: "document_date", dir: "desc" }}
        parties={parties && parties.ok ? parties.data.data.map((party) => ({ id: party.id, label: `${party.name} · ${party.phone}` })) : null}
      />
    </>
  );
}
