import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileSpreadsheet, Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree } from "@/lib/api/catalog-server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { SORT_KEYS, productQuery } from "@/lib/product-list";
import { parseTableParams, type RawSearchParams, type TableParams } from "@/lib/table-params";
import { ProductsTable } from "./products-table";
import { ReindexButton } from "./reindex-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("products") };
}

type Params = TableParams<(typeof SORT_KEYS)[number]>;

/** One page of the table's URL state as GET /admin/products parameters (the API filters, sorts and pages). */
function pageQuery(params: Params, page: number, perPage: number) {
  return { ...productQuery(params), page, per_page: perPage };
}

/** Active and hidden products; archived ones only when the status filter asks for them (17.10.0, catalog.products). */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("products");
  const params = parseTableParams(await searchParams, {
    sortKeys: SORT_KEYS,
    defaultSort: "newest",
    filterKeys: ["category_id", "brand_id", "status", "stock", "image"],
  });
  const api = await serverApi();
  let products = await load(api.GET("/admin/products", { params: { query: pageQuery(params, params.page, params.perPage) } }));
  if (!products.ok) return <PageError error={products.error} />;
  if (products.data.data.length === 0 && products.data.total > 0 && params.page > 1) {
    products = await load(
      api.GET("/admin/products", {
        params: { query: pageQuery(params, lastPage(products.data.total, params.perPage), params.perPage) },
      }),
    );
    if (!products.ok) return <PageError error={products.error} />;
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
            {permissions.includes("catalog.import") ? (
              <Link href="/catalog/import" className={buttonClasses({ variant: "secondary" })}>
                <FileSpreadsheet className="size-4" aria-hidden />
                {t("import.open")}
              </Link>
            ) : null}
            <Link href="/catalog/products/new" className={buttonClasses()} data-testid="product-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Link>
          </>
        }
      />
      <ProductsTable
        rows={products.data.data}
        state={{
          page: products.data.page,
          perPage: params.perPage,
          total: products.data.total,
          sort: params.sort,
          dir: params.dir,
        }}
        query={productQuery(params)}
        tree={tree.ok ? tree.data : []}
        brands={brands.ok ? brands.data : []}
        canBulkEdit={permissions.includes("prices.change")}
      />
    </>
  );
}
