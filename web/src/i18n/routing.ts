import { defineRouting } from "next-intl/routing";

/**
 * Arabic is the default locale and renders at the bare path (`/`, `/style-guide`);
 * English is prefixed (`/en`, `/en/style-guide`). Direction is derived from the
 * locale in the layout — see `localeDirection`.
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "as-needed",
  // Arabic is the brand default, so `/` is always Arabic regardless of the
  // visitor's Accept-Language. Without this, an en-US browser is redirected to
  // /en and never sees the RTL default. Visitors switch via the AR/EN control.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

export const localeLabel: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
};
