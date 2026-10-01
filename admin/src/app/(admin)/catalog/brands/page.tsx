import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { BrandsView } from "./brands-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("brands") };
}

/**
 * Brands (catalog.brands): an entity of their own, linked to products beside
 * the subcategory — never a category level. Search and paging run on the API.
 */
export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("brands");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["sort_order"] as const,
    defaultSort: "sort_order",
  });
  const api = await serverApi();
  const query = (page: number) => ({
    ...(params.q ? { q: params.q } : {}),
    page,
    per_page: params.perPage,
  });
  let brands = await load(api.GET("/admin/brands", { params: { query: query(params.page) } }));
  if (!brands.ok) return <PageError error={brands.error} />;
  // A stale URL past the last page (brands were deleted): show the last one.
  if (brands.data.data.length === 0 && brands.data.total > 0 && params.page > 1) {
    brands = await load(
      api.GET("/admin/brands", { params: { query: query(lastPage(brands.data.total, params.perPage)) } }),
    );
    if (!brands.ok) return <PageError error={brands.error} />;
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <BrandsView
        rows={brands.data.data}
        state={{
          page: brands.data.page,
          perPage: params.perPage,
          total: brands.data.total,
          sort: params.sort,
          dir: params.dir,
        }}
      />
    </>
  );
}
