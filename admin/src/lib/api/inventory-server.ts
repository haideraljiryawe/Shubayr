import "server-only";
import { load, type serverApi } from "./server";
import { locationIndex, type DocumentType, type LocationInfo, type Warehouse } from "@/lib/inventory";

/* ---------------------------------------------------------------------------
 * Reads the inventory pages share.
 *
 * Document lines and movements carry ids only (variant, lot, location), so a
 * page names them from two places: every location from the one warehouse
 * list, and each lot's SKU and lot number from a one-row balance read per
 * distinct lot. A document has few lots; the lookups are capped so a large
 * one degrades to short ids instead of spending the rate-limit window.
 * ------------------------------------------------------------------------- */

type Api = Awaited<ReturnType<typeof serverApi>>;

export async function loadPermissions(api: Api): Promise<string[]> {
  const me = await load(api.GET("/me"));
  return me.ok ? (me.data.permissions ?? []) : [];
}

export async function loadWarehouses(api: Api): Promise<{ warehouses: Warehouse[]; locations: Map<string, LocationInfo> }> {
  const result = await load(api.GET("/admin/inventory/warehouses"));
  const warehouses = result.ok ? result.data : [];
  return { warehouses, locations: locationIndex(warehouses) };
}

export interface LotInfo {
  sku: string;
  lotNumber: string | null;
  variantId: string;
  productId: string;
  expiry: string | null;
}

const LOOKUP_CAP = 12;

/** SKU and lot number per lot id (at most LOOKUP_CAP lookups). */
export async function describeLots(api: Api, batchIds: Iterable<string>): Promise<Map<string, LotInfo>> {
  const ids = [...new Set(batchIds)].slice(0, LOOKUP_CAP);
  const found = await Promise.all(
    ids.map(async (id) => {
      const page = await load(
        api.GET("/admin/inventory/balances", { params: { query: { batch_id: id, per_page: 1 } } }),
      );
      const row = page.ok ? page.data.data[0] : undefined;
      return row
        ? ([
            id,
            {
              sku: row.sku,
              lotNumber: row.lot_number,
              variantId: row.variant_id,
              productId: row.product_id,
              expiry: row.expiry_date,
            },
          ] as const)
        : null;
    }),
  );
  return new Map(found.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

/** One page of one document type (the four list routes share a shape). */
export function loadDocumentPage(api: Api, type: DocumentType, query: { page: number; per_page: number }) {
  const init = { params: { query } };
  switch (type) {
    case "opening":
      return load(api.GET("/admin/inventory/openings", init));
    case "transfer":
      return load(api.GET("/admin/inventory/transfers", init));
    case "count":
      return load(api.GET("/admin/inventory/counts", init));
    case "write_down":
      return load(api.GET("/admin/inventory/write-downs", init));
  }
}

export function loadDocument(api: Api, type: DocumentType, id: string) {
  return load(api.GET("/admin/inventory/documents/{type}/{id}", { params: { path: { type, id } } }));
}
