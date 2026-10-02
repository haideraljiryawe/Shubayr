import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import type { NumberParseOptions } from "@/lib/number";
import type { TableParams } from "@/lib/table-params";

/* ---------------------------------------------------------------------------
 * Inventory (API 8.2, build phase 5): warehouses and locations, lots and
 * their balances, the append-only movement ledger, and the four posted
 * document types — opening stock, transfers, counts and write-downs.
 *
 * Stock never changes except through a document. Quantities are exact to
 * three decimals; a piece SKU (whole_units_only) takes whole numbers only.
 * Cost fields are omitted by the API without `cost.view`, and the screens
 * hide their columns as well rather than showing empty cells.
 * ------------------------------------------------------------------------- */

export type Warehouse = components["schemas"]["Warehouse"];
export type WarehouseLocation = components["schemas"]["WarehouseLocation"];
export type Balance = components["schemas"]["InventoryBalance"];
export type BalancePage = components["schemas"]["InventoryBalancePage"];
export type Lot = components["schemas"]["InventoryLot"];
export type Movement = components["schemas"]["StockMovement"];
export type MovementPage = components["schemas"]["StockMovementPage"];
export type MovementType = components["schemas"]["StockMovementType"];
export type Opening = components["schemas"]["InventoryOpening"];
export type Transfer = components["schemas"]["StockTransfer"];
export type Count = components["schemas"]["StockCount"];
export type WriteDown = components["schemas"]["InventoryWriteDown"];
export type InventoryDocument = Opening | Transfer | Count | WriteDown;
export type DocumentPage = components["schemas"]["InventoryDocumentPage"];

export const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const MOVEMENT_TYPES = [
  "receive",
  "reserve",
  "release",
  "issue_to_custody",
  "custody_to_sold",
  "return_in",
  "transfer",
  "adjust",
  "write_down",
] as const satisfies readonly MovementType[];

/* ----------------------------------------------------------- documents */

/** The API's document types (GET /admin/inventory/documents/{type}/{id}). */
export const DOCUMENT_TYPES = ["opening", "transfer", "count", "write_down"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Each document type's list page. */
export const DOCUMENT_LIST: Record<DocumentType, string> = {
  opening: "/inventory/openings",
  transfer: "/inventory/transfers",
  count: "/inventory/counts",
  write_down: "/inventory/write-downs",
};

/** One document's page. A count has its own (it is entered and approved there). */
export function documentHref(type: DocumentType, id: string): string {
  const safe = encodeURIComponent(id);
  return type === "count" ? `/inventory/counts/${safe}` : `/inventory/documents/${type}/${safe}`;
}

export function lotHref(id: string): string {
  return `/inventory/lots/${encodeURIComponent(id)}`;
}

/** The stock screen filtered to one SKU, location, warehouse or lot. */
export function stockHref(filters: Partial<Record<"variant_id" | "location_id" | "warehouse_id" | "batch_id", string>>): string {
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return query ? `/inventory/stock?${query}` : "/inventory/stock";
}

/** Inventory source types (movements, lots and journal entries) and their documents. */
const SOURCE_DOCUMENTS: Record<string, DocumentType> = {
  inventory_opening: "opening",
  stock_transfer: "transfer",
  stock_count: "count",
  inventory_write_down: "write_down",
};

export type SourceLink =
  | { kind: "document"; type: DocumentType; href: string }
  | { kind: "purchase"; href: string }
  | { kind: "order"; href: string }
  | { kind: "none" };

/**
 * Where a movement (or lot) came from. Documents link to their page (a
 * purchase invoice to the purchasing screens); an
 * order movement (issue to custody, sale) links to the order; a reservation
 * carries the order NUMBER as its reference, so it links to the orders list
 * searched by it. Returns and anything newer have no admin page yet.
 */
export function sourceLink(row: { source_type: string; source_id?: string | null; reference?: string | null }): SourceLink {
  const type = SOURCE_DOCUMENTS[row.source_type];
  if (type && row.source_id) return { kind: "document", type, href: documentHref(type, row.source_id) };
  if (row.source_type === "purchase_invoice" && row.source_id) {
    return { kind: "purchase", href: `/purchasing/invoices/${encodeURIComponent(row.source_id)}` };
  }
  if (row.source_type === "order" && row.source_id) {
    return { kind: "order", href: `/orders/${encodeURIComponent(row.source_id)}` };
  }
  if (row.source_type === "stock_reservation" && row.reference) {
    return { kind: "order", href: `/orders?q=${encodeURIComponent(row.reference)}` };
  }
  return { kind: "none" };
}

/** The document a journal entry was posted from, for the ledger's links. */
export function inventoryEntrySourceHref(entry: { source_type: string; source_id: string }): string | null {
  const type = SOURCE_DOCUMENTS[entry.source_type];
  return type ? documentHref(type, entry.source_id) : null;
}

export const INVENTORY_SOURCE_TYPES = Object.keys(SOURCE_DOCUMENTS);

/* ---------------------------------------------------------- quantities */

/** Thousandths, exactly: 1.234 → 1234. The API's quantities have ≤ 3 decimals. */
export function toMilli(value: number | string | null | undefined): number {
  const number = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 1000) : 0;
}

export function fromMilli(milli: number): number {
  return milli / 1000;
}

/** The parse rule for a quantity of this SKU: whole units, or up to 3 decimals. */
export function quantityRule(wholeUnitsOnly: boolean | null | undefined, max?: number): NumberParseOptions {
  return {
    ...(wholeUnitsOnly === false ? { maxDecimals: 3 } : { integer: true }),
    ...(max !== undefined ? { max } : {}),
  };
}

/** "1,250.5" — Latin digits in both locales, up to three decimals, no unit. */
export function formatQuantity(value: number | string | null | undefined, locale = "en"): string {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    numberingSystem: "latn",
    maximumFractionDigits: 3,
  }).format(fromMilli(toMilli(value)));
}

/** IQD cost with up to 4 decimals (moving averages are not whole dinars). */
export function formatCost(value: number | string | null | undefined, locale = "en"): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    numberingSystem: "latn",
    maximumFractionDigits: 4,
  }).format(Number(value));
  return `${number} IQD`;
}

/* -------------------------------------------------------------- stock */

export interface StockTotals {
  onHand: number;
  reserved: number;
  available: number;
  /** Lot-level: counted once per lot however many locations it sits in. */
  custody: number;
  /** On hand in non-sellable locations (damaged, quarantine…). */
  nonSellable: number;
}

/** Totals over lot/location balance rows, exactly. */
export function stockTotals(rows: readonly Balance[]): StockTotals {
  let onHand = 0;
  let reserved = 0;
  let available = 0;
  let nonSellable = 0;
  const custody = new Map<string, number>();
  for (const row of rows) {
    onHand += toMilli(row.quantity);
    reserved += toMilli(row.reserved);
    if (row.is_sellable) available += toMilli(row.available);
    else nonSellable += toMilli(row.quantity);
    custody.set(row.batch_id, toMilli(row.custody));
  }
  const custodyTotal = [...custody.values()].reduce((sum, value) => sum + value, 0);
  return {
    onHand: fromMilli(onHand),
    reserved: fromMilli(reserved),
    available: fromMilli(available),
    custody: fromMilli(custodyTotal),
    nonSellable: fromMilli(nonSellable),
  };
}

export type Availability = "out_of_stock" | "low_stock" | "in_stock";

/** The catalog's own availability state, as a badge tone. */
export function availabilityTone(state: Availability | undefined): "danger" | "warning" | "success" | "neutral" {
  if (state === "out_of_stock") return "danger";
  if (state === "low_stock") return "warning";
  if (state === "in_stock") return "success";
  return "neutral";
}

/** A lot is expired when its expiry date (a calendar day) is before today. */
export function isExpired(expiry: string | null | undefined, today: string): boolean {
  return Boolean(expiry) && expiry!.slice(0, 10) < today;
}

/** Rows a transfer can take from: unreserved stock only. */
export function transferable(row: Pick<Balance, "available">): boolean {
  return toMilli(row.available) > 0;
}

/* ----------------------------------------------------------- locations */

export interface LocationInfo {
  id: string;
  code: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  sellable: boolean;
  active: boolean;
}

/** Every location by id, with its warehouse, from GET /admin/inventory/warehouses. */
export function locationIndex(warehouses: readonly Warehouse[]): Map<string, LocationInfo> {
  const index = new Map<string, LocationInfo>();
  for (const warehouse of warehouses) {
    for (const location of warehouse.locations ?? []) {
      if (!location.id) continue;
      index.set(location.id, {
        id: location.id,
        code: location.code ?? "",
        warehouseId: warehouse.id ?? "",
        warehouseCode: warehouse.code ?? "",
        warehouseName: warehouse.name ?? "",
        sellable: location.is_sellable ?? true,
        active: Boolean(location.is_active) && Boolean(warehouse.is_active),
      });
    }
  }
  return index;
}

/** "MAIN · A-01-01-01" */
export function locationLabel(info: LocationInfo | undefined, fallback = "—"): string {
  return info ? `${info.warehouseCode} · ${info.code}` : fallback;
}

/* ---------------------------------------------------------- write-down */

/**
 * A write-down posts only from a non-sellable location (the API refuses
 * otherwise), so damaged or expired stock that still sits on a sellable
 * shelf is first moved by a transfer — a document of its own — and then
 * written down from where it landed.
 */
export function writeDownNeedsMove(row: Pick<Balance, "is_sellable">): boolean {
  return row.is_sellable;
}

/* -------------------------------------------------------------- counts */

/** Counted minus system, exactly (positive = surplus, negative = shortage). */
export function countDifference(system: number | string, counted: number | string): number {
  return fromMilli(toMilli(counted) - toMilli(system));
}

export interface CountLineState {
  batchId: string;
  locationId: string;
  system: number;
  counted: string | null;
}

export function lineKey(line: { batch_id: string; location_id: string }): string {
  return `${line.batch_id}:${line.location_id}`;
}

export interface CountSummary {
  shortage: number;
  surplus: number;
  changedLines: number;
  missing: number;
}

export function summarizeCount(lines: readonly CountLineState[]): CountSummary {
  let shortage = 0;
  let surplus = 0;
  let changedLines = 0;
  let missing = 0;
  for (const line of lines) {
    if (line.counted === null) {
      missing += 1;
      continue;
    }
    const difference = toMilli(line.counted) - toMilli(line.system);
    if (difference < 0) shortage -= difference;
    if (difference > 0) surplus += difference;
    if (difference !== 0) changedLines += 1;
  }
  return { shortage: fromMilli(shortage), surplus: fromMilli(surplus), changedLines, missing };
}

/**
 * Counting a lot below what is reserved on it releases reservations, and
 * the orders holding them are flagged for inventory attention (API 8.2).
 * How much would be released at this line, given its reserved quantity now.
 */
export function reservationShortfall(counted: number | string | null, reserved: number | string): number {
  if (counted === null) return 0;
  return fromMilli(Math.max(0, toMilli(reserved) - toMilli(counted)));
}

/** The API refusing a count whose scope moved after its snapshot (409). */
export function isStaleCount(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && /after the snapshot/i.test(error.message);
}

export function isWholeUnitsError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SKU_WHOLE_UNITS_ONLY";
}

/**
 * Counted quantities carried from a stale count into its fresh snapshot.
 * A line whose system quantity is unchanged keeps what was counted; a line
 * that moved, or is new, starts at its new system quantity and is marked
 * for re-verification. Lines that left the scope are dropped.
 */
export function carryCounts(
  previous: ReadonlyArray<{ key: string; system: number; counted: string }>,
  next: ReadonlyArray<{ batch_id: string; location_id: string; system_quantity: number }>,
): Map<string, { counted: string; reverify: boolean }> {
  const before = new Map(previous.map((line) => [line.key, line]));
  const result = new Map<string, { counted: string; reverify: boolean }>();
  for (const line of next) {
    const key = lineKey(line);
    const old = before.get(key);
    const same = old !== undefined && toMilli(old.system) === toMilli(line.system_quantity);
    result.set(key, {
      counted: same ? old.counted : String(fromMilli(toMilli(line.system_quantity))),
      reverify: !same,
    });
  }
  return result;
}

/** The scope a count was taken over, for a fresh snapshot of the same scope. */
export function countScope(count: Pick<Count, "warehouse_id" | "location_id" | "variant_id" | "reason">) {
  return {
    ...(count.warehouse_id ? { warehouse_id: count.warehouse_id } : {}),
    ...(count.location_id ? { location_id: count.location_id } : {}),
    ...(count.variant_id ? { variant_id: count.variant_id } : {}),
    reason: count.reason,
  };
}

/* ----------------------------------------------------- list parameters */

export const STOCK_FILTER_KEYS = ["warehouse_id", "location_id", "variant_id", "batch_id"] as const;

/** The stock table's URL state as GET /admin/inventory/balances parameters. */
export function balanceQuery(params: TableParams, page = params.page) {
  const f = params.filters;
  return {
    page,
    per_page: params.perPage,
    ...(f.warehouse_id && UUID.test(f.warehouse_id) ? { warehouse_id: f.warehouse_id } : {}),
    ...(f.location_id && UUID.test(f.location_id) ? { location_id: f.location_id } : {}),
    ...(f.variant_id && UUID.test(f.variant_id) ? { variant_id: f.variant_id } : {}),
    ...(f.batch_id && UUID.test(f.batch_id) ? { batch_id: f.batch_id } : {}),
  };
}

export const MOVEMENT_FILTER_KEYS = ["type", "location_id", "variant_id", "batch_id", "custody_party_id"] as const;

/** The movement table's URL state as GET /admin/inventory/movements parameters. */
export function movementQuery(params: TableParams, page = params.page) {
  const f = params.filters;
  const type = (MOVEMENT_TYPES as readonly string[]).includes(f.type ?? "") ? (f.type as MovementType) : undefined;
  const uuid = (key: string) => (f[key] && UUID.test(f[key]) ? { [key]: f[key] } : {});
  return {
    page,
    per_page: params.perPage,
    ...(type ? { type } : {}),
    ...uuid("location_id"),
    ...uuid("variant_id"),
    ...uuid("batch_id"),
    ...uuid("custody_party_id"),
  };
}

/** A short, stable form of an id the API gives no name for. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}
