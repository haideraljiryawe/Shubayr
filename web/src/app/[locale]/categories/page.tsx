import type { Metadata } from "next";
import { PackageOpen, Search } from "lucide-react";
import { alternatesFor } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryGrid } from "@/components/catalog/category-grid";
import { CatalogError } from "@/components/catalog/states";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api";
import { getCategoriesOnce } from "@/lib/server-data";

type CategoriesPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CategoriesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const [nav, catalog] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "catalog" }),
  ]);

  return {
    title: nav("categories"),
    description: catalog("categoriesDescription"),
    alternates: alternatesFor(locale, "/categories"),
  };
}

export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [nav, catalog, header] = await Promise.all([
    getTranslations("nav"),
    getTranslations("catalog"),
    getTranslations("header"),
  ]);
  const categories = await getCategoriesOnce().catch(() => null);
  const departments = categories
    ?.filter(
      (category) =>
        !category.parent_id &&
        category.is_visible !== false &&
        Boolean(category.slug) &&
        Boolean(category.name_ar || category.name_en),
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-text lg:text-3xl">
          {nav("categories")}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/brands"
            data-testid="brands-link"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-primary-dark transition-colors hover:bg-card"
          >
            {catalog("brandsLink")}
          </Link>
          <Link
            href="/search"
            aria-label={header("search")}
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text transition-colors hover:bg-card"
          >
            <Search className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      {departments === undefined ? (
        <CatalogError />
      ) : departments.length === 0 ? (
        <Card tone="muted" padding="lg" className="py-12 text-center">
          <PackageOpen
            className="mx-auto size-10 text-text-muted"
            aria-hidden
          />
          <p className="mt-4 font-medium text-text">
            {catalog("categoriesEmpty")}
          </p>
        </Card>
      ) : (
        <CategoryGrid
          categories={departments}
          locale={locale as Locale}
          label={catalog("browseCategories")}
        />
      )}
    </div>
  );
}
