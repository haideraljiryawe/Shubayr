import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Alert, buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree } from "@/lib/api/catalog-server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi, type Loaded } from "@/lib/api/server";
import type { Product } from "@/lib/catalog";
import { lastPage } from "@/lib/list-queries";
import {
  READ_THROUGH_LIMIT,
  hasLocalFilters,
  localFilters,
  matchesLocalFilters,
  pageOf,
  type LocalFilters,
} from "@/lib/product-list";
import { parseTableParams, type RawSearchParams, type TableParams } from "@/lib/table-params";
import { ProductsTable } from "./products-table";
import { ReindexButton } from "./reindex-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("products") };
}

const SORT_KEYS = ["newest", "price"] as const;
type Params = TableParams<(typeof SORT_KEYS)[number]>;
type Api = Awaited<ReturnType<typeof serverApi>>;

/** The table's URL state as GET /admin/products parameters (what the API filters itself). */
function productQuery(params: Params, page: number, perPage: number) {
  return {
    ...(params.q ? { q: params.q } : {}),
    ...(params.filters.category_id ? { category_id: params.filters.category_id } : {}),
    ...(params.filters.brand_id ? { brand_id: [params.filters.brand_id] } : {}),
    sort:
      params.sort === "price"
        ? params.dir === "desc"
          ? ("price_desc" as const)
          : ("price_asc" as const)
        : ("newest" as const),
    page,
    per_page: perPage,
  };
}

/**
 * Status and stock are not API filters yet: read the API's own (name,
 * category, brand) result through, 100 at a time, and keep the matches.
 */
// TODO(D2): remove with the 2,000-product workaround once the list uses D2's
// product-list endpoint (see READ_THROUGH_LIMIT in src/lib/product-list.ts).
async function readThrough(
  api: Api,
  params: Params,
  filters: LocalFilters,
): Promise<Loaded<{ rows: Product[]; truncated: boolean }>> {
  const rows: Product[] = [];
  const pages = READ_THROUGH_LIMIT / 100;
  for (let page = 1; page <= pages; page += 1) {
    const result = await load(api.GET("/admin/products", { params: { query: productQuery(params, page, 100) } }));
    if (!result.ok) return result;
    rows.push(...result.data.data.filter((product) => matchesLocalFilters(product, filters)));
    if (page * 100 >= result.data.total) return { ok: true, data: { rows, truncated: false } };
  }
  return { ok: true, data: { rows, truncated: true } };
}

/** Every product, hidden and archived included (catalog.products). */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("products");
  const params = parseTableParams(await searchParams, {
    sortKeys: SORT_KEYS,
    defaultSort: "newest",
    filterKeys: ["category_id", "brand_id", "status", "stock"],
  });
  const filters = localFilters(params.filters);
  const api = await serverApi();

  let rows: Product[];
  let total: number;
  let page: number;
  let truncated = false;
  if (hasLocalFilters(filters)) {
    const all = await readThrough(api, params, filters);
    if (!all.ok) return <PageError error={all.error} />;
    const slice = pageOf(all.data.rows, params.page, params.perPage);
    rows = slice.rows;
    total = all.data.rows.length;
    page = slice.page;
    truncated = all.data.truncated;
  } else {
    let products = await load(api.GET("/admin/products", { params: { query: productQuery(params, params.page, params.perPage) } }));
    if (!products.ok) return <PageError error={products.error} />;
    if (products.data.data.length === 0 && products.data.total > 0 && params.page > 1) {
      products = await load(
        api.GET("/admin/products", {
          params: { query: productQuery(params, lastPage(products.data.total, params.perPage), params.perPage) },
        }),
      );
      if (!products.ok) return <PageError error={products.error} />;
    }
    rows = products.data.data;
    total = products.data.total;
    page = products.data.page;
  }
  // Filters degrade to absent without their own permissions; the list stays.
  const [tree, brands, permissions] = await Promise.all([loadCategoryTree(api), loadAllBrands(api), loadPermissions(api)]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <ReindexButton />
            <Link href="/catalog/products/new" className={buttonClasses()} data-testid="product-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Link>
          </>
        }
      />
      {truncated ? (
        <Alert tone="info" className="mb-4" data-testid="products-truncated">
          {t("filters.truncated", { limit: READ_THROUGH_LIMIT })}
        </Alert>
      ) : null}
      <ProductsTable
        rows={rows}
        state={{
          page,
          perPage: params.perPage,
          total,
          sort: params.sort,
          dir: params.dir,
        }}
        tree={tree.ok ? tree.data : []}
        brands={brands.ok ? brands.data : []}
        canBulkEdit={permissions.includes("prices.change")}
      />
    </>
  );
}
