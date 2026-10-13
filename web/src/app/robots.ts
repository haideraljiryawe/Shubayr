import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { storeIsPublic } from "@/lib/store-gate";

/**
 * /robots.txt — the catalog is open to crawlers; personal and staff pages are
 * not (they are also marked noindex). Search results stay crawlable so their
 * own noindex is seen; brand listings are indexable through the sitemap.
 */
// STORE_PUBLIC is read at run time, so robots.txt is built per request.
export const dynamic = "force-dynamic";

const PRIVATE = ["/account", "/cart", "/checkout", "/login", "/deliveries", "/monitor", "/notifications", "/style-guide"];

export default function robots(): MetadataRoute.Robots {
  // Before opening (STORE_PUBLIC=false) nothing is crawled at all.
  if (!storeIsPublic()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...PRIVATE, ...PRIVATE.map((path) => `/en${path}`)],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
