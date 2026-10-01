import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree } from "@/lib/api/catalog-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams, type TableParams } from "@/lib/table-params";
import { ProductsTable } from "./products-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("products") };
}

const SORT_KEYS = ["newest", "price"] as const;

/** The table's URL state as GET /admin/products parameters. */
function productQuery(params: TableParams<(typeof SORT_KEYS)[number]>, page: number) {
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
    per_page: params.perPage,
  };
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
    filterKeys: ["category_id", "brand_id"],
  });
  const api = await serverApi();
  let products = await load(api.GET("/admin/products", { params: { query: productQuery(params, params.page) } }));
  if (!products.ok) return <PageError error={products.error} />;
  if (products.data.data.length === 0 && products.data.total > 0 && params.page > 1) {
    products = await load(
      api.GET("/admin/products", {
        params: { query: productQuery(params, lastPage(products.data.total, params.perPage)) },
      }),
    );
    if (!products.ok) return <PageError error={products.error} />;
  }
  // Filters degrade to absent without their own permissions; the list stays.
  const [tree, brands] = await Promise.all([loadCategoryTree(api), loadAllBrands(api)]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/catalog/products/new" className={buttonClasses()} data-testid="product-new">
            <Plus className="size-4" aria-hidden />
            {t("new")}
          </Link>
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
        tree={tree.ok ? tree.data : []}
        brands={brands.ok ? brands.data : []}
      />
    </>
  );
}
