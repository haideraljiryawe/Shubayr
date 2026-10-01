import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { storeDay } from "@/lib/finance/dates";
import { balanceQuery, STOCK_FILTER_KEYS, stockTotals, type Balance } from "@/lib/inventory";
import { StockTabs } from "./stock-tabs";
import { StockView, type SkuSummary } from "./stock-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("stock") };
}

/** Rows read to total one SKU (100 a page; a SKU rarely spans more lots). */
const SUMMARY_PAGES = 5;

/**
 * Stock by lot and location (inventory.view): on hand, reserved, available
 * and in custody, filtered by the API by warehouse, location, SKU or lot.
 * With a SKU chosen, the page also totals that SKU across every lot and
 * shows the catalog's own low/out state for it (which applies the SKU's
 * low-stock threshold, or the store default).
 */
export default async function StockPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("inventory.stock");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["expiry"],
    defaultSort: "expiry",
    filterKeys: STOCK_FILTER_KEYS,
  });
  const api = await serverApi();
  const [first, permissions, { warehouses, locations }] = await Promise.all([
    load(api.GET("/admin/inventory/balances", { params: { query: balanceQuery(params) } })),
    loadPermissions(api),
    loadWarehouses(api),
  ]);
  let balances = first;
  if (balances.ok && balances.data.data.length === 0 && balances.data.total > 0 && params.page > 1) {
    balances = await load(
      api.GET("/admin/inventory/balances", {
        params: { query: balanceQuery(params, lastPage(balances.data.total, params.perPage)) },
      }),
    );
  }
  if (!balances.ok) return <PageError error={balances.error} />;

  const query = balanceQuery(params);
  let summary: SkuSummary | null = null;
  if ("variant_id" in query && query.variant_id) {
    summary = await skuSummary(api, query.variant_id, permissions.includes("catalog.products"));
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <StockTabs active="lots" canBySku={permissions.includes("catalog.products")} />
      <StockView
        rows={balances.data.data}
        state={{ page: balances.data.page, perPage: balances.data.per_page, total: balances.data.total, sort: "expiry", dir: "asc" }}
        warehouses={warehouses}
        locations={Object.fromEntries(locations)}
        filters={params.filters}
        summary={summary}
        today={storeDay()}
      />
    </>
  );
}

async function skuSummary(api: Awaited<ReturnType<typeof serverApi>>, variantId: string, canReadCatalog: boolean): Promise<SkuSummary> {
  const rows: Balance[] = [];
  let complete = true;
  for (let page = 1; page <= SUMMARY_PAGES; page += 1) {
    const result = await load(api.GET("/admin/inventory/balances", { params: { query: { variant_id: variantId, page, per_page: 100 } } }));
    if (!result.ok) {
      complete = false;
      break;
    }
    rows.push(...result.data.data);
    if (rows.length >= result.data.total) break;
    if (page === SUMMARY_PAGES) complete = false;
  }
  const totals = stockTotals(rows);
  const sku = rows[0]?.sku ?? null;
  let catalog: SkuSummary["catalog"] = null;
  const productId = rows[0]?.product_id;
  if (canReadCatalog && productId) {
    const product = await load(api.GET("/admin/products/{id}", { params: { path: { id: productId } } }));
    const variant = product.ok ? (product.data.variants ?? []).find((row) => row.id === variantId) : undefined;
    if (product.ok && variant) {
      catalog = {
        productId,
        productName: { ar: product.data.name_ar ?? "", en: product.data.name_en ?? "" },
        availability: variant.availability ?? null,
        availableQty: variant.available_qty ?? null,
        threshold: variant.low_stock_threshold ?? null,
        baseUnit: variant.base_unit ?? "piece",
      };
    }
  }
  return { variantId, sku, totals, complete, catalog };
}
