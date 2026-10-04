import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumbs } from "@/components/product/breadcrumbs";
import { InfoTabs, type SpecRow } from "@/components/product/info-tabs";
import {
  ProductDetail,
  REVIEWS_ANCHOR,
} from "@/components/product/product-detail";
import { ProductReviews } from "@/components/product/reviews";
import {
  RelatedSkeleton,
  ReviewsSkeleton,
} from "@/components/product/skeletons";
import { ProductCard } from "@/components/ui/product-card";
import { SectionHeader } from "@/components/ui/section-header";
import { ApiError, type Product } from "@/lib/api";
import {
  hasPriceRange,
  pricingForVariant,
  primaryImageUrl,
  stockLevelFor,
} from "@/lib/product";
import type { Locale } from "@/i18n/routing";
import { jsonLdText, productJsonLd } from "@/lib/seo";
import { SITE_URL, alternatesFor, openGraphFor, storeNameFor } from "@/lib/site";
import { getCategoriesOnce, getProductAvailabilityOnce, getProductOnce, getProductReviewCountOnce, getSettingsOnce, listProductsOnce, listReviewsOnce } from "@/lib/server-data";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Fetches the product, turning a contract 404 into a Next notFound(). */
async function loadProduct(id: string): Promise<Product | null> {
  try {
    return await getProductOnce(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const product = await loadProduct(id).catch(() => null);
  if (!product) {
    const t = await getTranslations({ locale, namespace: "product" });
    return { title: t("notFoundTitle") };
  }

  const name =
    ((locale as Locale) === "ar" ? product.name_ar : product.name_en) ?? "";
  const t = await getTranslations({ locale, namespace: "seo" });
  const description =
    product.description?.trim() || t("productDescription", { name });
  const image = primaryImageUrl(product);
  const path = `/product/${product.id ?? id}`;

  return {
    title: name,
    description,
    // One URL per product: ?variant= is a view of the same page.
    alternates: alternatesFor(locale, path),
    openGraph: openGraphFor({
      locale,
      siteName: await storeNameFor(
        locale,
        (await getSettingsOnce().catch(() => null))?.store_name,
      ),
      title: name,
      description,
      path,
      images: image ? [{ url: image, alt: name }] : undefined,
    }),
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const typedLocale = locale as Locale;
  const t = await getTranslations("product");

  const product = await loadProduct(id);
  if (!product) notFound();

  const query = await searchParams;
  const variantParam = query.variant;
  const initialVariantId =
    typeof variantParam === "string" ? variantParam : undefined;

  // Availability gates the CTA, so it is awaited with the product. A failure
  // degrades that piece rather than blanking a page that already has the item.
  const [availability, categories] = await Promise.all([
    getProductAvailabilityOnce(id).catch(() => null),
    getCategoriesOnce().catch(() => null),
  ]);

  const name = (typedLocale === "ar" ? product.name_ar : product.name_en) ?? "";
  const category = categories
    ?.flatMap((c) => [c, ...(c.children ?? [])])
    .find((c) => c.id === product.category_id);
  const categoryName =
    (typedLocale === "ar" ? category?.name_ar : category?.name_en) ?? "";
  // Products live in a subcategory; its department is the crumb above it.
  const department = category?.parent_id
    ? categories?.find((c) => c.id === category.parent_id)
    : undefined;
  const departmentName =
    (typedLocale === "ar" ? department?.name_ar : department?.name_en) ?? "";

  // Only the count is needed up front (it sits beside the title); the review
  // bodies stream in below.
  const reviewCount = await getProductReviewCountOnce(id).catch(() => 0);
  const [settings, nonce] = await Promise.all([
    getSettingsOnce().catch(() => null),
    headers().then((list) => list.get("x-nonce") ?? undefined),
  ]);

  const brandName =
    (typedLocale === "ar" ? product.brand?.name_ar : product.brand?.name_en) ??
    "";
  const level = stockLevelFor(product, availability);
  const specs: SpecRow[] = [
    categoryName ? { label: t("category"), value: categoryName } : null,
    brandName ? { label: t("brand"), value: brandName } : null,
    {
      label: t("availabilitySpec"),
      value:
        level === "in_stock"
          ? t("inStock")
          : level === "low_stock"
            ? t("lowStock")
            : t("outOfStockLabel"),
    },
    ...(product.variants ?? [])
      .filter((variant) => variant.sku)
      .slice(0, 1)
      .map((variant) => ({ label: t("sku"), value: variant.sku as string })),
  ].filter((row): row is SpecRow => row !== null);

  const structuredData = productJsonLd({
    product,
    locale: typedLocale,
    siteUrl: SITE_URL,
    level,
    storeName: settings?.store_name || "Shubayr",
    reviewCount,
  });

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        data-testid="product-jsonld"
        dangerouslySetInnerHTML={{ __html: jsonLdText(structuredData) }}
      />
      {/* pb-32 clears the sticky mobile CTA bar. */}
      <div className="mx-auto max-w-7xl px-4 pb-32 pt-4 lg:px-8 lg:pb-16 lg:pt-6">
        <Breadcrumbs
          items={[
            ...(department?.slug && departmentName
              ? [
                  {
                    label: departmentName,
                    href: `/category/${department.slug}`,
                  },
                ]
              : []),
            ...(category?.slug && categoryName
              ? [{ label: categoryName, href: `/category/${category.slug}` }]
              : []),
            { label: name },
          ]}
        />

        <div className="mt-4">
          <ProductDetail
            product={product}
            availability={availability}
            reviewCount={reviewCount}
            initialVariantId={initialVariantId}
          />
        </div>

        {product.description ? (
          <InfoTabs description={product.description} specs={specs} />
        ) : null}

        <Suspense fallback={<ReviewsSkeleton />}>
          <ReviewsSection id={id} ratingAvg={product.rating_avg ?? 0} />
        </Suspense>

        <Suspense fallback={<RelatedSkeleton />}>
          <RelatedSection
            categoryId={product.category_id}
            excludeId={product.id}
            locale={typedLocale}
          />
        </Suspense>
      </div>
    </>
  );
}

/** Streams in below the fold; a failure shows the empty-reviews state. */
async function ReviewsSection({
  id,
  ratingAvg,
}: {
  id: string;
  ratingAvg: number;
}) {
  const page = await listReviewsOnce(id, { page: 1, per_page: 50 }).catch(() => null);

  return (
    <ProductReviews
      id={REVIEWS_ANCHOR}
      reviews={page?.data ?? []}
      total={page?.total ?? 0}
      ratingAvg={ratingAvg}
    />
  );
}

async function RelatedSection({
  categoryId,
  excludeId,
  locale,
}: {
  categoryId?: string;
  excludeId?: string;
  locale: Locale;
}) {
  const t = await getTranslations("product");
  if (!categoryId) return null;

  const related = await listProductsOnce({ category_id: categoryId, per_page: 6 })
    .then((page) => page.data.filter((item) => item.id !== excludeId))
    .catch(() => []);

  if (related.length === 0) return null;

  return (
    <section className="mt-12">
      <SectionHeader title={t("related")} />
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {related.slice(0, 5).map((item) => (
          <li key={item.id} className="flex">
            <ProductCard
              id={item.id ?? ""}
              name={(locale === "ar" ? item.name_ar : item.name_en) ?? ""}
              nameAr={item.name_ar ?? ""}
              nameEn={item.name_en ?? ""}
              availableQty={item.available_qty}
              {...pricingForVariant(item)}
              priceFrom={hasPriceRange(item)}
              requiresVariant={(item.variants ?? []).length > 0}
              rating={item.rating_avg}
              imageUrl={primaryImageUrl(item)}
              inStock={item.in_stock ?? true}
              className="w-full"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
