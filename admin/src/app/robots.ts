import type { MetadataRoute } from "next";

/** /robots.txt — the admin is an internal tool: nothing is for crawlers. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
