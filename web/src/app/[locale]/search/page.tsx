import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api } from "@/lib/api";
import { flattenCategories } from "@/lib/catalog";
import { parseCatalogQuery } from "@/lib/catalog-query";
import { ProductListing } from "@/components/catalog/listing";
import { CatalogSkeleton } from "@/components/catalog/states";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalog" });
  const query = parseCatalogQuery(await searchParams);
  return {
    title: query.q ? t("searchTitle", { query: query.q }) : t("allProducts"),
    description: t("searchDescription"),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const query = parseCatalogQuery(await searchParams);
  const categories = await api.getCategories().catch(() => null);
  const options = flattenCategories(categories ?? []).filter(
    (c) => c.is_active !== false,
  );
  if (
    query.category_id &&
    categories !== null &&
    !options.some((c) => c.id === query.category_id)
  )
    delete query.category_id;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <Suspense key={JSON.stringify(query)} fallback={<CatalogSkeleton />}>
        <ProductListing
          locale={locale as Locale}
          title={
            query.q ? t("searchTitle", { query: query.q }) : t("allProducts")
          }
          basePath="/search"
          query={query}
          categories={options}
          categoriesFailed={categories === null}
        />
      </Suspense>
    </div>
  );
}
