import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { categoryOptions, sortBanners, type Banner } from "@/lib/banners";
import { BannersView } from "./banners-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("banners") };
}

const PER_PAGE = 100;

/**
 * Home banners (catalog.products, like the API's banner routes): every banner,
 * disabled and expired ones included, in the order the store shows them, each
 * with the API's computed status. There are only ever a handful, so all pages
 * are read and the status filter runs on the page. The category tree feeds
 * the "opens a category" picker: the admin tree when the person may read it
 * (catalog.categories), otherwise the customer-visible one.
 */
export default async function BannersPage() {
  const t = await getTranslations("banners");
  const api = await serverApi();
  const banners: Banner[] = [];
  for (let page = 1; ; page += 1) {
    const result = await load(api.GET("/admin/banners", { params: { query: { page, per_page: PER_PAGE } } }));
    if (!result.ok) return <PageError error={result.error} />;
    banners.push(...result.data.data);
    if (result.data.data.length < PER_PAGE || banners.length >= result.data.total) break;
  }
  let tree = await load(api.GET("/admin/categories"));
  if (!tree.ok) tree = await load(api.GET("/categories"));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <BannersView banners={sortBanners(banners)} categories={tree.ok ? categoryOptions(tree.data) : []} />
    </>
  );
}
