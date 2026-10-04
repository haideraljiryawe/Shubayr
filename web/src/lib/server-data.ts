import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { api, type ProductQuery } from "./api";
import { listCatalogProducts } from "./catalog";
import type { CatalogQuery } from "./catalog-query";
import { compileTrust, forwardedHeaders, shopperAddress } from "./forwarding";

/* ---------------------------------------------------------------------------
 * Every API read the store makes while rendering on its server.
 *
 * 1. The shopper's address goes with each call (X-Forwarded-For and
 *    X-Real-IP, overwriting anything the client sent), taken only from the
 *    store's trusted front proxies — see forwarding.ts. The API then
 *    rate-limits each shopper, not the store server as a whole.
 *
 * 2. Public catalogue reads are cached across requests for a short while:
 *    settings, categories and brands for STORE_CACHE_SHARED_SECONDS (60 s);
 *    banners, product lists and a product's page data for
 *    STORE_CACHE_CATALOG_SECONDS (10 s). 0 turns a tier off. The cache key is
 *    the read and its arguments — never the shopper's headers, which Next's
 *    own fetch cache would key on — so one shopper's miss fills the entry
 *    for everyone, fetched with that shopper's address.
 *
 * 3. Within one render, generateMetadata, the layout and the page share one
 *    answer (React `cache`).
 *
 * Only public reads live here. Nothing personal is ever read on the store's
 * server: the session lives in the browser, and the cart, checkout, account,
 * agent and monitor pages call the API from there, uncached.
 * ------------------------------------------------------------------------- */

interface ServerRequestContext {
  headers: Record<string, string>;
}

const context = new AsyncLocalStorage<ServerRequestContext>();
// api.ts reads it on the server (it is shared with the browser bundle, so it
// can't import node:async_hooks itself).
(globalThis as { __shubayrServerRequest?: AsyncLocalStorage<ServerRequestContext> }).__shubayrServerRequest = context;

const trust = compileTrust(process.env.TRUSTED_FRONT_PROXIES);

function seconds(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const SHARED_SECONDS = seconds("STORE_CACHE_SHARED_SECONDS", 60);
const CATALOG_SECONDS = seconds("STORE_CACHE_CATALOG_SECONDS", 10);

async function shopperHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  return forwardedHeaders(shopperAddress(incoming.get("x-forwarded-for"), trust));
}

/** A public read: forwarded, cached across requests for `ttl` seconds, deduped per render. */
function publicRead<A extends unknown[], T>(name: string, ttl: number, load: (...args: A) => Promise<T>) {
  return cache(async (...args: A): Promise<T> => {
    const request = { headers: await shopperHeaders() };
    const run = () => context.run(request, () => load(...args));
    if (ttl <= 0) return run();
    return unstable_cache(run, [name, JSON.stringify(args)], { revalidate: ttl, tags: [name] })();
  });
}

export const getSettingsOnce = publicRead("settings", SHARED_SECONDS, () => api.getSettings());
export const getCategoriesOnce = publicRead("categories", SHARED_SECONDS, () => api.getCategories());
export const getBrandsOnce = publicRead("brands", SHARED_SECONDS, () => api.listBrands());

export const getBannersOnce = publicRead("banners", CATALOG_SECONDS, () => api.getBanners());
export const listProductsOnce = publicRead("products", CATALOG_SECONDS, (query: ProductQuery) => api.listProducts(query));
export const listDealsOnce = publicRead("deals", CATALOG_SECONDS, (limit: number) => api.listDeals(limit));
export const listCatalogProductsOnce = publicRead("listing", CATALOG_SECONDS, (query: CatalogQuery) => listCatalogProducts(query));
export const getProductOnce = publicRead("product", CATALOG_SECONDS, (id: string) => api.getProduct(id));
export const getProductAvailabilityOnce = publicRead("availability", CATALOG_SECONDS, (id: string) => api.getProductAvailability(id));
export const getProductReviewCountOnce = publicRead("review-count", CATALOG_SECONDS, (id: string) => api.getProductReviewCount(id));
