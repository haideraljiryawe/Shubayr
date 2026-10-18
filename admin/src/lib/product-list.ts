import type { components, paths } from "@/types/api";
import type { Product } from "./catalog";

/* ---------------------------------------------------------------------------
 * The product list for a large catalog (API 15.1), kept pure so it is
 * unit-tested.
 *
 * GET /admin/products filters, searches (names, descriptions, SKU and
 * barcode), sorts and pages in the database; these helpers turn the table's
 * URL state into its parameters. Bulk changes go through POST
 * /admin/products/bulk: up to 500 products in one transaction, one result per
 * product, idempotent by operation id.
 * ------------------------------------------------------------------------- */

export type ProductListQuery = NonNullable<paths["/admin/products"]["get"]["parameters"]["query"]>;
type ApiSort = NonNullable<ProductListQuery["sort"]>;
export type BulkInput = components["schemas"]["ProductBulkInput"];
export type BulkResult = components["schemas"]["ProductBulkResult"];
/** A bulk request without its operation id (Omit kept per variant of the union). */
export type BulkRequest = BulkInput extends infer T ? (T extends unknown ? Omit<T, "operation_id"> : never) : never;

export const STATUS_FILTERS = ["active", "hidden", "archived"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STOCK_FILTERS = ["in_stock", "low_stock", "out_of_stock"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export interface ListFilters {
  status: StatusFilter | null;
  stock: StockFilter | null;
  image: "with" | "without" | null;
}

/** Only known status, stock and picture filters are read from the URL. */
export function listFilters(filters: Record<string, string>): ListFilters {
  const status = (STATUS_FILTERS as readonly string[]).includes(filters.status ?? "")
    ? (filters.status as StatusFilter)
    : null;
  const stock = (STOCK_FILTERS as readonly string[]).includes(filters.stock ?? "")
    ? (filters.stock as StockFilter)
    : null;
  const image = ["with", "without"].includes(filters.image ?? "")
    ? (filters.image as "with" | "without")
    : null;
  return { status, stock, image };
}

/* ------------------------------------------------------------ sorting */

/** The table's sortable columns. */
export const SORT_KEYS = ["newest", "name", "sku", "price"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** A column and direction as the API's sort. */
export function apiSort(sort: SortKey, dir: "asc" | "desc"): ApiSort {
  switch (sort) {
    case "price":
      return dir === "desc" ? "price_desc" : "price_asc";
    case "name":
      return dir === "desc" ? "name_desc" : "name_asc";
    case "sku":
      return dir === "desc" ? "sku_desc" : "sku_asc";
    default:
      return "newest";
  }
}

/** The table's URL state as GET /admin/products parameters, without paging. */
export function productQuery(params: {
  q?: string;
  filters: Record<string, string>;
  sort: SortKey;
  dir: "asc" | "desc";
}): ProductListQuery {
  const filters = listFilters(params.filters);
  return {
    ...(params.q ? { q: params.q } : {}),
    ...(params.filters.category_id ? { category_id: params.filters.category_id } : {}),
    ...(params.filters.brand_id ? { brand_id: [params.filters.brand_id] } : {}),
    ...(filters.status ? { status: [filters.status] } : {}),
    ...(filters.stock ? { availability: [filters.stock] } : {}),
    ...(filters.image ? { has_image: filters.image === "with" } : {}),
    sort: apiSort(params.sort, params.dir),
  };
}

/* ------------------------------------------------------------ bulk actions */

/** The bulk endpoint takes at most this many products in one change. */
export const BULK_LIMIT = 500;
/** The list endpoint's largest page; "select all matching" reads in pages of it. */
export const MAX_PER_PAGE = 100;

export type BulkAction =
  | { kind: "publish" }
  | { kind: "hide" }
  | { kind: "category"; categoryId: string }
  | { kind: "brand"; brandId: string | null };

/** Products a bulk action would leave unchanged are not sent. */
export function bulkTargets(products: readonly Product[], action: BulkAction): Product[] {
  return products.filter((product) => {
    switch (action.kind) {
      case "publish":
        return !(product.status === "active" && product.published_at);
      case "hide":
        return product.status !== "hidden";
      case "category":
        return product.category_id !== action.categoryId;
      case "brand":
        return (product.brand_id ?? null) !== action.brandId;
    }
  });
}

/** The request body for one bulk change (the caller adds the operation id). */
export function bulkBody(action: BulkAction, ids: readonly string[]): BulkRequest {
  const common = { ids: [...ids] };
  switch (action.kind) {
    case "category":
      return { ...common, action: "set_category", category_id: action.categoryId };
    case "brand":
      return { ...common, action: "set_brand", brand_id: action.brandId };
    default:
      return { ...common, action: action.kind };
  }
}

export interface BulkLine {
  id: string;
  name: string;
  ok: boolean;
  message: string | null;
}

export interface BulkOutcome {
  done: number;
  failed: number;
  /** One line per product sent, failures first. */
  lines: BulkLine[];
}

/** The API's per-product results, named and ordered for the report. */
export function bulkOutcome(result: BulkResult, nameOf: (id: string) => string, unknown: string): BulkOutcome {
  const lines = result.results.map((item) => ({
    id: item.id,
    name: nameOf(item.id),
    ok: item.status === "updated",
    message: item.status === "updated" ? null : (item.message ?? item.code ?? unknown),
  }));
  lines.sort((a, b) => Number(a.ok) - Number(b.ok));
  const failed = lines.filter((line) => !line.ok).length;
  return { done: lines.length - failed, failed, lines };
}

/** The primary picture of a product, for the list's thumbnail. */
export function primaryImage(product: Product): string | null {
  const images = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return images[0]?.url ?? null;
}
