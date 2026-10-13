import type { components } from "@/types/api";
import type { Product } from "./catalog";

/* ---------------------------------------------------------------------------
 * The product list for a large catalog: filters, bulk actions and paging,
 * kept pure so they are unit-tested.
 *
 * GET /admin/products filters by name, category and brand on the server.
 * It has no status or stock filter yet (listed for the backend in the PR
 * that added these screens), so when one of those is chosen the admin reads
 * the matching products page by page — up to READ_THROUGH_LIMIT of them —
 * filters them itself and pages the result. The screen says so when the
 * limit cut the list short. Once the API takes `status` and `availability`,
 * productQuery passes them on and the read-through goes away.
 * ------------------------------------------------------------------------- */

export type ProductPatch = components["schemas"]["ProductPatch"];

export const STATUS_FILTERS = ["active", "hidden", "archived"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STOCK_FILTERS = ["in_stock", "low_stock", "out_of_stock"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

/**
 * The most products one filtered view reads through (pages of 100).
 *
 * TODO(D2): when the admin moves to D2's product-list endpoint (status and
 * stock filtered and paged by the API), delete this limit, the read-through in
 * src/app/(admin)/catalog/products/page.tsx, localFilters/matchesLocalFilters/
 * pageOf here, and the "products-truncated" notice.
 */
export const READ_THROUGH_LIMIT = 2000;

export interface LocalFilters {
  status: StatusFilter | null;
  stock: StockFilter | null;
}

export function localFilters(filters: Record<string, string>): LocalFilters {
  const status = (STATUS_FILTERS as readonly string[]).includes(filters.status ?? "")
    ? (filters.status as StatusFilter)
    : null;
  const stock = (STOCK_FILTERS as readonly string[]).includes(filters.stock ?? "")
    ? (filters.stock as StockFilter)
    : null;
  return { status, stock };
}

export function hasLocalFilters(filters: LocalFilters): boolean {
  return filters.status !== null || filters.stock !== null;
}

/** Whether a product passes the status and stock filters. */
export function matchesLocalFilters(product: Product, filters: LocalFilters): boolean {
  if (filters.status && (product.status ?? "hidden") !== filters.status) return false;
  if (filters.stock && (product.availability ?? "out_of_stock") !== filters.stock) return false;
  return true;
}

/** One page of an already filtered list, clamped to the last page. */
export function pageOf<T>(rows: readonly T[], page: number, perPage: number): { rows: T[]; page: number } {
  const last = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(1, page), last);
  return { rows: rows.slice((current - 1) * perPage, current * perPage), page: current };
}

/* ------------------------------------------------------------ bulk actions */

export type BulkAction =
  | { kind: "publish" }
  | { kind: "hide" }
  | { kind: "category"; categoryId: string }
  | { kind: "brand"; brandId: string | null };

/**
 * The PATCH each selected product gets. Publishing goes with status, as in
 * the editor: an active product is published (and must pass the API's
 * publishing checks — an approved price on every SKU), a hidden one is not.
 */
export function bulkPatch(action: BulkAction): ProductPatch {
  switch (action.kind) {
    case "publish":
      return { status: "active", published: true };
    case "hide":
      return { status: "hidden", published: false };
    case "category":
      return { category_id: action.categoryId };
    case "brand":
      return { brand_id: action.brandId };
  }
}

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

export interface BulkOutcome {
  done: number;
  failed: Array<{ id: string; name: string; message: string }>;
}

/** The primary picture of a product, for the list's thumbnail. */
export function primaryImage(product: Product): string | null {
  const images = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return images[0]?.url ?? null;
}
