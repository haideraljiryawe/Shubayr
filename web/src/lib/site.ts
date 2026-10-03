import { routing, type Locale } from "@/i18n/routing";

/* ---------------------------------------------------------------------------
 * The storefront's public address, for canonical URLs, Open Graph, the
 * sitemap and robots.txt. Deployment settings (see docs/deploy/web-and-admin.md):
 * NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_API_URL are baked into the build, and
 * next.config.ts refuses a production build without them — localhost is a
 * development default only.
 * ------------------------------------------------------------------------- */

const production = process.env.NODE_ENV === "production";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? (production ? "" : "http://localhost:3000")).replace(/\/$/, "");

/** A public path for a locale: Arabic at the bare path, English under /en. */
export function localizedPath(locale: Locale | string, path: string): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return locale === routing.defaultLocale ? clean || "/" : `/${locale}${clean}`;
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Canonical and language alternates for a page, relative to `metadataBase`.
 * Arabic is the canonical store; English is its alternate.
 */
export function alternatesFor(locale: Locale | string, path: string) {
  return {
    canonical: localizedPath(locale, path),
    languages: {
      ar: localizedPath("ar", path),
      en: localizedPath("en", path),
      "x-default": localizedPath(routing.defaultLocale, path),
    },
  };
}

/**
 * Open Graph for a page. A page's `openGraph` replaces the layout's whole, so
 * every page builds the full set here (site name, locale, its own URL).
 */
export function openGraphFor(input: {
  locale: Locale | string;
  siteName: string;
  title: string;
  description: string;
  path?: string;
  images?: Array<{ url: string; alt?: string }>;
}) {
  return {
    siteName: input.siteName,
    title: input.title,
    description: input.description,
    type: "website" as const,
    locale: input.locale === "ar" ? "ar_IQ" : "en_US",
    alternateLocale: input.locale === "ar" ? ["en_US"] : ["ar_IQ"],
    ...(input.path ? { url: localizedPath(input.locale, input.path) } : {}),
    ...(input.images?.length ? { images: input.images } : {}),
  };
}

/** The store's display name for metadata (white-label settings first). */
export async function storeNameFor(locale: string, settingsName: string | null | undefined): Promise<string> {
  if (settingsName) return settingsName;
  const { getTranslations } = await import("next-intl/server");
  return (await getTranslations({ locale, namespace: "brand" }))("name");
}
