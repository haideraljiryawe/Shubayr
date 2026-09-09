export type CatalogLocale = 'ar' | 'en';

export type BilingualName = {
  name_ar?: string | null;
  name_en?: string | null;
};

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveLocalizedName(
  value: BilingualName,
  locale: CatalogLocale,
): string {
  const preferred = locale === 'ar' ? value.name_ar : value.name_en;
  const fallback = locale === 'ar' ? value.name_en : value.name_ar;
  return nonEmpty(preferred) ?? nonEmpty(fallback) ?? '';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Normalizes every bilingual-name pair in an API response, including nested
 * product/category arrays, while leaving Dates, Decimals, and other class
 * instances intact for Nest's serializer.
 */
export function applyBilingualNameFallback<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      applyBilingualNameFallback(item),
    ) as unknown as T;
  }
  if (!isPlainRecord(value)) return value;

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      applyBilingualNameFallback(item),
    ]),
  );
  if (
    Object.hasOwn(normalized, 'name_ar') ||
    Object.hasOwn(normalized, 'name_en')
  ) {
    const names: BilingualName = {
      name_ar:
        typeof normalized.name_ar === 'string' ? normalized.name_ar : undefined,
      name_en:
        typeof normalized.name_en === 'string' ? normalized.name_en : undefined,
    };
    normalized.name_ar = resolveLocalizedName(names, 'ar');
    normalized.name_en = resolveLocalizedName(names, 'en');
  }

  return normalized as T;
}
