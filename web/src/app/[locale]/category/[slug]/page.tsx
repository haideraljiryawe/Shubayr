import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api } from "@/lib/api";
import { findCategoryBySlug } from "@/lib/catalog";
import { parseCatalogQuery } from "@/lib/catalog-query";
import { ProductListing } from "@/components/catalog/listing";
import { CatalogError, CatalogSkeleton } from "@/components/catalog/states";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await api
    .getCategories()
    .then((all) => findCategoryBySlug(all, slug))
    .catch(() => undefined);
  return {
    title: category
      ? locale === "ar"
        ? category.name_ar
        : category.name_en
      : slug,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  // Keep category validation blocking, with no route-level loading.tsx:
  // notFound() must run before a Suspense fallback can flush HTTP 200.
  const categories = await api.getCategories().catch(() => null);
  if (categories === null)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <CatalogError />
      </div>
    );
  const category = findCategoryBySlug(categories, slug);
  if (!category || category.is_visible === false) notFound();
  const query = parseCatalogQuery(await searchParams);
  const allowedIds = [
    category.id,
    ...(category.children ?? [])
      .filter((c) => c.is_visible !== false)
      .map((c) => c.id),
  ];
  if (!query.category_id || !allowedIds.includes(query.category_id))
    query.category_id = category.id;
  const title = (locale === "ar" ? category.name_ar : category.name_en) ?? slug;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <nav
        className="mb-4 text-xs text-primary-dark"
        aria-label={t("backCategories")}
      >
        <Link href="/categories" className="underline underline-offset-4">
          {t("backCategories")}
        </Link>
      </nav>
      {/* Product data and review counts stream only after category validation. */}
      <Suspense key={JSON.stringify(query)} fallback={<CatalogSkeleton />}>
        <ProductListing
          locale={locale as Locale}
          title={title}
          basePath={`/category/${slug}`}
          query={query}
          categories={categories}
          category={category}
        />
      </Suspense>
    </div>
  );
}
