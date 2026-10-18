import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { RETURN_FILTER_KEYS, RETURN_SORT_KEYS, orderNumberFilter, returnListQuery, type Return } from "@/lib/returns";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { ReturnsView, type OrderLookup } from "./returns-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("returns") };
}

type Api = Awaited<ReturnType<typeof serverApi>>;

/**
 * The order the search box names. The queue filters by order id only, so the
 * typed NUMBER is looked up first (orders.view); an exact match narrows the
 * list, anything else says why it doesn't.
 */
async function lookupOrder(api: Api, number: string | null, permissions: readonly string[]): Promise<OrderLookup> {
  if (!number) return { kind: "none" };
  if (!permissions.includes("orders.view")) return { kind: "forbidden", number };
  const result = await load(api.GET("/admin/orders", { params: { query: { q: number, per_page: 20 } } }));
  if (!result.ok) return { kind: "forbidden", number };
  const match = result.data.data.find((order) => order.order_number?.toLowerCase() === number.toLowerCase());
  return match?.id ? { kind: "found", number: match.order_number ?? number, id: match.id } : { kind: "missing", number };
}

/**
 * Customer returns (returns.view, contract 17.0): the queue staff work
 * through, newest first, filtered by status, date and order number, sorted
 * and paged by the server.
 */
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("returns.list");
  const params = parseTableParams(await searchParams, {
    sortKeys: RETURN_SORT_KEYS,
    defaultSort: "date",
    defaultDir: "desc",
    filterKeys: RETURN_FILTER_KEYS,
  });
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  const order = await lookupOrder(api, orderNumberFilter(params.q), permissions);

  let rows: { data: Return[]; page: number; per_page: number; total: number } = { data: [], page: 1, per_page: params.perPage, total: 0 };
  let ignoredDates = false;
  if (order.kind === "none" || order.kind === "found") {
    const { query, ignoredDates: ignored } = returnListQuery({
      filters: params.filters,
      page: params.page,
      perPage: params.perPage,
      sort: params.sort,
      dir: params.dir,
      orderId: order.kind === "found" ? order.id : null,
    });
    ignoredDates = ignored;
    const fetchPage = (page: number) => load(api.GET("/returns/queue", { params: { query: { ...query, page } } }));
    let result = await fetchPage(params.page);
    if (result.ok && result.data.data.length === 0 && result.data.total > 0 && params.page > 1) {
      result = await fetchPage(lastPage(result.data.total, params.perPage));
    }
    if (!result.ok) return <PageError error={result.error} />;
    rows = result.data;
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ReturnsView
        rows={rows.data}
        state={{ page: rows.page, perPage: rows.per_page, total: rows.total, sort: params.sort, dir: params.dir }}
        order={order}
        ignoredDates={ignoredDates}
      />
    </>
  );
}
