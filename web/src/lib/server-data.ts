import { cache } from "react";
import { api } from "./api";

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
const cached = readCacheSeconds > 0 ? { next: { revalidate: readCacheSeconds } } : undefined;

export const getSettingsOnce = cache(() => api.getSettings(cached));

export const getCategoriesOnce = cache(() => api.getCategories(cached));

export const getProductOnce = cache((id: string) => api.getProduct(id));
