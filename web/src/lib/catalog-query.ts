import type { ProductQuery } from "./api";

/** min_rating is a storefront filter; it is not sent to the product API. */
export type CatalogQuery = ProductQuery & { min_rating?: number };
export type RawSearchParams = Record<string, string | string[] | undefined>;

const sorts: NonNullable<ProductQuery["sort"]>[] = [
  "newest",
  "price_asc",
  "price_desc",
  "rating",
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function number(value: string | undefined): number | undefined {
  if (value === undefined || !value.trim()) return undefined;
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseCatalogQuery(raw: RawSearchParams): CatalogQuery {
  const query: CatalogQuery = {
    page: Math.max(
      1,
      Math.min(1_000_000, Math.floor(number(first(raw.page)) ?? 1)),
    ),
    per_page: Math.max(
      1,
      Math.min(100, Math.floor(number(first(raw.per_page)) ?? 12)),
    ),
    sort: sorts.includes(first(raw.sort) as NonNullable<ProductQuery["sort"]>)
      ? (first(raw.sort) as ProductQuery["sort"])
      : "newest",
  };

  const q = first(raw.q)?.trim();
  const categoryId = first(raw.category_id)?.trim();
  if (q) query.q = q;
  if (categoryId) query.category_id = categoryId;

  const minPrice = number(first(raw.min_price));
  const maxPrice = number(first(raw.max_price));
  if (minPrice !== undefined) query.min_price = minPrice;
  if (maxPrice !== undefined) query.max_price = maxPrice;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    query.min_price = maxPrice;
    query.max_price = minPrice;
  }

  const minRating = number(first(raw.min_rating));
  if (minRating !== undefined && minRating > 0 && minRating <= 5) {
    query.min_rating = minRating;
  }
  if (first(raw.on_sale) === "true") query.on_sale = true;
  return query;
}

/** One URL builder for pagination, sorting, chips, and progressive-enhancement forms. */
export function catalogHref(
  base: string,
  query: CatalogQuery,
  overrides: Partial<CatalogQuery> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...overrides })) {
    if (value === undefined || value === "" || value === false) continue;
    if (key === "page" && value === 1) continue;
    if (key === "per_page" && value === 12) continue;
    if (key === "sort" && value === "newest") continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `${base}?${serialized}` : base;
}
