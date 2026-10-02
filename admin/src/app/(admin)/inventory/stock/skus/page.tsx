import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { StockTabs } from "../stock-tabs";
import { SkusView } from "./skus-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("stock") };
}

/**
 * Availability per SKU, as the catalog computes it — sellable, unexpired,
 * unreserved stock against each SKU's low-stock threshold (or the store
 * default). Built on GET /admin/products, so it needs catalog.products; each
 * SKU links to its lots and locations.
 */
export default async function StockBySkuPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("inventory.stock");
  const params = parseTableParams(await searchParams, { sortKeys: ["newest"], defaultSort: "newest" });
  const query = (page: number) => ({ ...(params.q ? { q: params.q } : {}), sort: "newest" as const, page, per_page: params.perPage });
  const api = await serverApi();
  let products = await load(api.GET("/admin/products", { params: { query: query(params.page) } }));
  if (products.ok && products.data.data.length === 0 && products.data.total > 0 && params.page > 1) {
    products = await load(api.GET("/admin/products", { params: { query: query(lastPage(products.data.total, params.perPage)) } }));
  }
  if (!products.ok) return <PageError error={products.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("bySkuDescription")} />
      <StockTabs active="skus" canBySku />
      <SkusView
        rows={products.data.data}
        state={{ page: products.data.page, perPage: params.perPage, total: products.data.total, sort: "newest", dir: "desc" }}
      />
    </>
  );
}
