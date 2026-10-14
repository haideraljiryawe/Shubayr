import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageError } from "@/components/shell/page-error";
import { PageHeader } from "@/components/ui";
import { load, serverApi } from "@/lib/api/server";
import { CatalogImportView } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products.import");
  return { title: t("title") };
}

export default async function CatalogImportPage() {
  const t = await getTranslations("products.import");
  const api = await serverApi();
  const history = await load(
    api.GET("/admin/catalog-imports", { params: { query: { page: 1, per_page: 20 } } }),
  );
  if (!history.ok) return <PageError error={history.error} />;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CatalogImportView initialHistory={history.data.data} />
    </>
  );
}
