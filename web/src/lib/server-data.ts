import { cache } from "react";
import { headers } from "next/headers";
import { api, type ProductQuery } from "./api";

/* ---------------------------------------------------------------------------
 * Server-render reads, once per request.
 *
 * generateMetadata, the layout and the page of one render each asked the API
 * for the store settings (and some for the categories or the product), so a
 * single page view cost up to four identical calls — all from the store's one
 * server address, against the API's per-address rate limit. React's `cache`
 * shares one answer across a single request and nothing more, so nothing is
 * ever served stale; a failure is shared the same way, and callers keep their
 * own fallbacks.
 * ------------------------------------------------------------------------- */

/**
 * STORE_READ_CACHE_SECONDS (server only, default 0 = off) additionally keeps
 * the settings and the category tree in Next's data cache for that long, so
 * busy rendering costs one call per window instead of one per page view.
 * Every page view needs the settings, and they come from the store's one
 * server address, so under load they alone can exhaust the API's
 * per-address rate limit. The live CI job sets it; production keeps reading
 * them fresh unless it is set there too.
 */
const readCacheSeconds = Number(process.env.STORE_READ_CACHE_SECONDS ?? 0);
const cached =
  readCacheSeconds > 0 ? { next: { revalidate: readCacheSeconds } } : undefined;

async function forwarded(init?: RequestInit): Promise<RequestInit> {
  const incoming = await headers();
  const forwardedFor = incoming.get("x-forwarded-for");
  if (!forwardedFor) return init ?? {};
  const merged = new Headers(init?.headers);
  merged.set("x-forwarded-for", forwardedFor);
  return { ...init, headers: merged };
}

export const getSettingsOnce = cache(async () =>
  api.getSettings(await forwarded(cached)),
);

export const getCategoriesOnce = cache(async () =>
  api.getCategories(await forwarded(cached)),
);

export const getProductOnce = cache(async (id: string) =>
  api.getProduct(id, await forwarded()),
);

export async function getBannersForRequest() {
  return api.getBanners(await forwarded());
}

export async function getBrandsForRequest() {
  return api.listBrands(await forwarded());
}

export async function getProductsForRequest(query: ProductQuery = {}) {
  return api.listProducts(query, await forwarded());
}

export async function getDealsForRequest(limit = 6) {
  return api.listDeals(limit, await forwarded());
}

export async function getAvailabilityForRequest(id: string) {
  return api.getProductAvailability(id, await forwarded());
}

export async function getReviewCountForRequest(id: string) {
  return api.getProductReviewCount(id, await forwarded());
}

export async function getReviewsForRequest(
  id: string,
  query: { page?: number; per_page?: number } = {},
) {
  return api.listReviews(id, query, await forwarded());
}
