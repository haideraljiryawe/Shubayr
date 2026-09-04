import type { Locale } from "@/i18n/routing";

const INTL_LOCALE: Record<Locale, string> = {
  ar: "ar-IQ",
  en: "en-US",
};

/**
 * How each currency is written. Intl's own currency style is not usable here:
 * under `ar-IQ` it renders USD as "US$" and injects RTL marks, so the mockup's
 * "$89" comes out as "‏89 US$". Formatting the number and placing the symbol
 * ourselves keeps the output identical in both locales.
 */
const CURRENCY_FORMAT: Record<
  string,
  { symbol: string; prefix: boolean; decimals: number }
> = {
  USD: { symbol: "$", prefix: true, decimals: 2 },
  EUR: { symbol: "€", prefix: true, decimals: 2 },
  // Iraqi dinar is written after the amount and never with fractions.
  IQD: { symbol: "د.ع", prefix: false, decimals: 0 },
};

/**
 * Format a money amount. Currency comes from GET /settings (white-label), so it
 * is always passed in rather than hard-coded. An unknown currency falls back to
 * "<amount> <CODE>", which is correct if unlovely.
 */
export function formatPrice(
  amount: number,
  currency: string,
  locale: Locale = "ar",
): string {
  const format = CURRENCY_FORMAT[currency];
  const decimals = format?.decimals ?? 2;

  const number = new Intl.NumberFormat(INTL_LOCALE[locale], {
    // Whole amounts render as $89 (like the mockup), not $89.00.
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    // Latin digits everywhere — the mockup shows $89 / 4.6, not ٨٩.
    numberingSystem: "latn",
  }).format(amount);

  if (!format) return `${number} ${currency}`;
  return format.prefix
    ? `${format.symbol}${number}`
    : `${number} ${format.symbol}`;
}

/** Compact count for review tallies: (124). */
export function formatCount(value: number, locale: Locale = "ar"): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    numberingSystem: "latn",
  }).format(value);
}

/** 4.55 -> "4.6" (one decimal), Latin digits. */
export function formatRating(value: number, locale: Locale = "ar"): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    numberingSystem: "latn",
  }).format(value);
}

/** Percentage off, shown on sale badges as -40%. */
export function formatDiscount(percent: number): string {
  return `-${Math.round(percent)}%`;
}
