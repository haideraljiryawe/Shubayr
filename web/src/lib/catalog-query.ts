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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Brand ids from `?brand_id=a&brand_id=b` (what the filter form submits) or
 * `?brand_id=a,b` (what the API also accepts). Anything that is not an id is
 * dropped rather than sent — the API would refuse the whole request with 422.
 * Fixture ids (mock mode) are short slugs, so those pass too.
 */
function brandIds(value: string | string[] | undefined): string[] {
  const raw = (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => UUID.test(entry) || /^[a-z0-9-]{1,40}$/.test(entry));
  return [...new Set(raw)];
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
  const brands = brandIds(raw.brand_id);
  if (brands.length) query.brand_id = brands;

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

/**
 * The query as form fields, one entry per value: a multi-select filter
 * (brand_id) becomes repeated fields, exactly as a GET form submits it.
 */
export function queryEntries(
  query: CatalogQuery,
): Array<[key: string, value: string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      for (const item of value) entries.push([key, String(item)]);
    } else {
      entries.push([key, String(value)]);
    }
  }
  return entries;
}

/** One URL builder for pagination, sorting, chips, and progressive-enhancement forms. */
export function catalogHref(
  base: string,
  query: CatalogQuery,
  overrides: Partial<CatalogQuery> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of queryEntries({ ...query, ...overrides })) {
    if (key === "page" && value === "1") continue;
    if (key === "per_page" && value === "12") continue;
    if (key === "sort" && value === "newest") continue;
    params.append(key, value);
  }
  const serialized = params.toString();
  return serialized ? `${base}?${serialized}` : base;
}
