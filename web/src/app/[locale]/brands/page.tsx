import type { Metadata } from "next";
import Image from "next/image";
import { PackageOpen } from "lucide-react";
import { alternatesFor } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogError } from "@/components/catalog/states";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api";
import { getBrandsOnce } from "@/lib/server-data";

/**
 * Rendered per request: brands are added, hidden and reordered from the Web
 * Admin at any time, and a build has no API to prerender them from.
 */
export const dynamic = "force-dynamic";

type BrandsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: BrandsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalog" });
  return {
    title: t("brandsTitle"),
    description: t("brandsDescription"),
    alternates: alternatesFor(locale, "/brands"),
  };
}

/**
 * «العلامات التجارية» — every visible brand, in the admin's order. Brands are
 * a filter over the whole catalog, never a level of it, so each tile opens
 * the product search narrowed to that brand rather than a page of its own.
 */
export default async function BrandsPage({ params }: BrandsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const brands = await getBrandsOnce().catch(() => null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-2xl font-bold text-text lg:text-3xl">
          {t("brandsTitle")}
        </h1>
        <p className="mt-1 text-sm text-text-muted">{t("brandsDescription")}</p>
      </div>

      {brands === null ? (
        <CatalogError />
      ) : brands.length === 0 ? (
        <Card tone="muted" padding="lg" className="py-12 text-center">
          <PackageOpen className="mx-auto size-10 text-text-muted" aria-hidden />
          <p className="mt-4 font-medium text-text">{t("brandsEmpty")}</p>
        </Card>
      ) : (
        <ul
          aria-label={t("brandsTitle")}
          data-testid="brand-grid"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
        >
          {brands.map((brand) => {
            const name =
              (locale as Locale) === "ar"
                ? brand.name_ar || brand.name_en
                : brand.name_en || brand.name_ar;
            return (
              <li key={brand.id} className="min-w-0">
                <Link
                  href={`/search?brand_id=${encodeURIComponent(brand.id)}`}
                  data-testid={`brand-tile-${brand.slug}`}
                  className="group flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-md border border-border/60 bg-card px-3 py-6 text-center transition-colors hover:bg-primary-light/20"
                >
                  {brand.logo_url ? (
                    <span className="relative size-14 overflow-hidden rounded-full bg-surface">
                      <Image
                        src={brand.logo_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-14 items-center justify-center rounded-full bg-primary-light/40 text-xl font-bold text-primary-dark"
                    >
                      {name.slice(0, 1)}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-text [overflow-wrap:anywhere] sm:text-base">
                    {name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
