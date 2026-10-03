import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * /robots.txt — the catalog is open to crawlers; personal and staff pages are
 * not (they are also marked noindex). Search results stay crawlable so their
 * own noindex is seen; brand listings are indexable through the sitemap.
 */
const PRIVATE = ["/account", "/cart", "/checkout", "/login", "/deliveries", "/monitor", "/notifications", "/style-guide"];

export default function robots(): MetadataRoute.Robots {
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
