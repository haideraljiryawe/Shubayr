import type { Brand, Category, Product } from "@/lib/api";
import { primaryImageUrl, productImageUrls, type StockLevel } from "@/lib/product";
import { localizedPath } from "@/lib/site";

/* ---------------------------------------------------------------------------
 * Search-engine output: product structured data (schema.org Product with an
 * Offer in IQD) and the sitemap's URL list. Pure functions, so the rules —
 * what is indexable, how availability maps — are testable without a server.
 * ------------------------------------------------------------------------- */

const SCHEMA_AVAILABILITY: Record<StockLevel, string> = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
};

/** Only an active, published product belongs in an index. */
export function isIndexableProduct(product: Pick<Product, "status" | "published_at">): boolean {
  if (product.status && product.status !== "active") return false;
  // The public API only lists published products; a null date says otherwise.
  return product.published_at !== null;
}

/** The store's IQD prices as schema.org wants them: plain numbers. */
function offerPrices(product: Product): number[] {
  const variantPrices = (product.variants ?? [])
    .map((variant) => variant.effective_price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  if (variantPrices.length) return variantPrices;
  const price = product.effective_price ?? product.price;
  return typeof price === "number" ? [price] : [];
}

/**
 * schema.org Product + Offer (or AggregateOffer across SKUs with different
 * prices), priced in the product's currency (IQD), with availability.
 */
export function productJsonLd(input: {
  product: Product;
  locale: string;
  siteUrl: string;
  level: StockLevel;
  storeName: string;
  reviewCount?: number;
}) {
  const { product, locale } = input;
  const name = (locale === "ar" ? product.name_ar : product.name_en) || product.name_ar || product.name_en || "";
  const url = `${input.siteUrl}${localizedPath(locale, `/product/${product.id}`)}`;
  const images = productImageUrls(product);
  const primary = primaryImageUrl(product);
  const prices = offerPrices(product);
  const currency = product.currency || "IQD";
  const availability = SCHEMA_AVAILABILITY[input.level];
  const seller = { "@type": "Organization", name: input.storeName };
  const low = prices.length ? Math.min(...prices) : undefined;
  const high = prices.length ? Math.max(...prices) : undefined;
  const offers =
    low !== undefined && high !== undefined && low !== high
      ? { "@type": "AggregateOffer", priceCurrency: currency, lowPrice: low, highPrice: high, offerCount: prices.length, availability, url, seller }
      : { "@type": "Offer", priceCurrency: currency, price: low ?? 0, availability, url, seller, itemCondition: "https://schema.org/NewCondition" };
  const sku = (product.variants ?? []).find((variant) => variant.sku)?.sku;
  const brand = (locale === "ar" ? product.brand?.name_ar : product.brand?.name_en) || product.brand?.name_ar || product.brand?.name_en;
  const ratingCount = product.rating_count ?? input.reviewCount ?? 0;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name,
    url,
    ...(product.description ? { description: product.description } : {}),
    ...(images.length ? { image: primary ? [primary, ...images.filter((image) => image !== primary)] : images } : {}),
    ...(sku ? { sku } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(ratingCount > 0 && (product.rating_avg ?? 0) > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating_avg, reviewCount: ratingCount, bestRating: 5, worstRating: 1 } }
      : {}),
    offers,
  };
}

/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency: "daily" | "weekly";
  priority: number;
  alternates: { languages: Record<string, string> };
}

/**
 * Every public page worth indexing: home, the directories, each visible
 * category (and subcategory), each visible brand's listing, and each active
 * product. Arabic is the canonical URL; English is listed as its alternate.
 */
export function sitemapEntries(input: {
  siteUrl: string;
  categories: Category[];
  brands: Brand[];
  products: Product[];
}): SitemapEntry[] {
  const entry = (path: string, changeFrequency: SitemapEntry["changeFrequency"], priority: number, lastModified?: string | null): SitemapEntry => ({
    url: `${input.siteUrl}${localizedPath("ar", path)}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    alternates: {
      languages: {
        ar: `${input.siteUrl}${localizedPath("ar", path)}`,
        en: `${input.siteUrl}${localizedPath("en", path)}`,
      },
    },
  });
  const visibleCategories = input.categories
    .filter((category) => category.is_visible !== false)
    .flatMap((category) => [category, ...(category.children ?? []).filter((child) => child.is_visible !== false)]);
  return [
    entry("/", "daily", 1),
    entry("/categories", "weekly", 0.6),
    entry("/brands", "weekly", 0.5),
    ...visibleCategories.filter((category) => category.slug).map((category) => entry(`/category/${category.slug}`, "daily", 0.8)),
    ...input.brands.filter((brand) => brand.is_visible !== false).map((brand) => entry(`/search?brand_id=${encodeURIComponent(brand.id)}`, "weekly", 0.5, brand.updated_at)),
    ...input.products
      .filter((product) => product.id && isIndexableProduct(product))
      .map((product) => entry(`/product/${product.id}`, "daily", 0.7, product.updated_at)),
  ];
}
