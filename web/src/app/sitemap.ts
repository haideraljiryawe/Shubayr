import type { MetadataRoute } from "next";
import { api, type Product } from "@/lib/api";
import { sitemapEntries } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

/**
 * /sitemap.xml — home, the directories, visible categories and brands, and
 * every active product (the public listing serves only those; the filter in
 * sitemapEntries is a second guard). Built per request from the live catalog,
 * so a hidden product drops out at once; a catalog that can't be read yields
 * the static pages rather than an error.
 */
export const dynamic = "force-dynamic";

/** A sitemap file holds at most 50,000 URLs. */
const MAX_PRODUCTS = 45_000;

async function allProducts(): Promise<Product[]> {
  const products: Product[] = [];
  for (let page = 1; products.length < MAX_PRODUCTS; page += 1) {
    const result = await api.listProducts({ page, per_page: 100 });
    products.push(...result.data);
    if (result.data.length === 0 || page * result.per_page >= result.total) break;
  }
  return products;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, brands, products] = await Promise.all([
    api.getCategories().catch(() => []),
    api.listBrands().catch(() => []),
    allProducts().catch(() => []),
  ]);
  return sitemapEntries({ siteUrl: SITE_URL, categories, brands, products });
}
