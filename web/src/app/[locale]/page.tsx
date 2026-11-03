import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryRail } from "@/components/home/category-rail";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { ProductSection } from "@/components/home/product-section";
import {
  CategoryRailSkeleton,
  HeroSkeleton,
  ProductGridSkeleton,
} from "@/components/home/skeletons";
import { SectionEmpty, SectionError } from "@/components/home/states";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, openGraphFor, storeNameFor } from "@/lib/site";
import { getBannersOnce, getCategoriesOnce, getSettingsOnce, listDealsOnce, listProductsOnce, listRecentlyAddedOnce } from "@/lib/server-data";

/** The store's front door: canonical at the bare path, English as its alternate. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const settings = await getSettingsOnce().catch(() => null);
  const siteName = await storeNameFor(locale, settings?.store_name);
  const description = (await getTranslations({ locale, namespace: "seo" }))(
    "homeDescription",
    { store: siteName },
  );
  return {
    alternates: alternatesFor(locale, "/"),
    openGraph: openGraphFor({
      locale,
      siteName,
      title: siteName,
      description,
      path: "/",
      images: settings?.logo_url
        ? [{ url: settings.logo_url, alt: siteName }]
        : undefined,
    }),
  };
}

/**
 * Home page. Every catalog read happens in a server component so the markup is
 * fully rendered for crawlers; each section streams in behind its own Suspense
 * boundary, so a slow strip never holds up the hero.
 */

/** Hero is its own async component purely so it can stream independently. */
async function Hero() {
  let banners;
  try {
    banners = await getBannersOnce();
  } catch {
    // A dead promo feed must never cost us the rest of the page.
    return null;
  }
  if (banners.length === 0) return null;
  return <HeroCarousel banners={banners} />;
}

/**
 * Recently Added (NOTE-004): the owner's managed strip, newest first, with the
 * normal product cards — shown only when it is switched on and has products.
 * It takes the place of the plain "New arrivals" strip so the page never shows
 * two near-identical rows; when it is off, empty or unreachable, the page is
 * exactly as before.
 */
async function RecentlyAddedOrNewArrivals({ locale }: { locale: Locale }) {
  const t = await getTranslations("home");
  const settings = await getSettingsOnce().catch(() => null);
  if (settings?.recently_added_enabled) {
    const count = Math.min(50, Math.max(1, settings.recently_added_max_count ?? 10));
    const recent = await listRecentlyAddedOnce(count).catch(() => null);
    if (recent && recent.length > 0) {
      return (
        <div data-testid="recently-added" data-count={recent.length}>
          <ProductSection title={t("recentlyAddedTitle")} locale={locale} load={async () => recent} />
        </div>
      );
    }
  }
  return (
    <div data-testid="new-arrivals">
      <ProductSection
        title={t("newArrivalsTitle")}
        viewAllHref="/search?sort=newest"
        locale={locale}
        load={async () => (await listProductsOnce({ sort: "newest", per_page: 5 })).data}
      />
    </div>
  );
}

async function Categories({ locale }: { locale: Locale }) {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");

  let categories;
  try {
    categories = await getCategoriesOnce();
  } catch {
    categories = null;
  }

  return (
    <section className="mt-8">
      <SectionHeader
        title={t("categoriesTitle")}
        actionLabel={tc("viewAll")}
        href="/categories"
      />
      <div className="mt-4">
        {categories === null ? (
          <SectionError />
        ) : categories.length === 0 ? (
          <SectionEmpty />
        ) : (
          <CategoryRail categories={categories} locale={locale} />
        )}
      </div>
    </section>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const typedLocale = locale as Locale;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <Suspense fallback={<HeroSkeleton />}>
        <Hero />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-8">
            <CategoryRailSkeleton />
          </div>
        }
      >
        <Categories locale={typedLocale} />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-10">
            <ProductGridSkeleton />
          </div>
        }
      >
        <ProductSection
          title={t("featuredTitle")}
          viewAllHref="/search?sort=rating"
          locale={typedLocale}
          priority
          load={async () =>
            (await listProductsOnce({ sort: "rating", per_page: 5 })).data
          }
        />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-10">
            <ProductGridSkeleton />
          </div>
        }
      >
        <RecentlyAddedOrNewArrivals locale={typedLocale} />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-10">
            <ProductGridSkeleton />
          </div>
        }
      >
        <ProductSection
          title={t("dealsTitle")}
          viewAllHref="/search?on_sale=true"
          locale={typedLocale}
          load={() => listDealsOnce(5)}
        />
      </Suspense>
    </div>
  );
}
