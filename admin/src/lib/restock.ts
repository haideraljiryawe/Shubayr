import type { LocationInfo } from "@/lib/inventory";
import type { CurrencyCode, Supplier } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * Restock (إعادة تعبئة المخزون): a purchase invoice prefilled from one
 * product, kept pure so the defaults and the line rules are unit-tested.
 *
 * - Every variant gets a line; a line left empty or at 0 is simply not part
 *   of the invoice, so restocking only the second colour is one quantity.
 * - The cost starts at what was last paid for that SKU: the supplier's unit
 *   cost on the invoice its newest lot came from (in that invoice's currency),
 *   or, for stock entered as opening stock, that lot's cost in IQD.
 * - The location starts where the product's newest stock went (if that
 *   location is still active), else the store's only — or only sellable —
 *   location.
 * - The supplier starts as the one the product was last bought from.
 * ------------------------------------------------------------------------- */

/** What the lots listing tells us (InventoryLot, cost fields with cost.view). */
export interface LotFacts {
  id: string;
  variant_id: string;
  entry_date: string;
  source_type: string;
  source_id: string | null;
  po_item_id: string | null;
  supplier_id: string | null;
  purchase_cost?: number;
  batch_stock?: ReadonlyArray<{ location_id: string }>;
}

/** One line of a purchase invoice, as GET /admin/purchase-invoices/{id} lists it. */
export interface InvoiceItemFacts {
  id: string;
  variant_id: string | null;
  base_unit_cost_currency?: number;
  currency_code?: CurrencyCode;
}

export interface LastCost {
  value: string;
  currency: CurrencyCode;
}

/** The newest lot: latest entry date, then id, for a stable answer. */
export function newestLot<T extends Pick<LotFacts, "entry_date" | "id">>(lots: readonly T[]): T | null {
  let best: T | null = null;
  for (const lot of lots) {
    if (!best || lot.entry_date > best.entry_date || (lot.entry_date === best.entry_date && lot.id > best.id)) best = lot;
  }
  return best;
}

const decimal = (value: number) => {
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(6).replace(/\.?0+$/, "") : text;
};

/** What was last paid for the SKU of `lot`, or null when the cost can't be read. */
export function lastCostOf(lot: LotFacts | null, items: readonly InvoiceItemFacts[]): LastCost | null {
  if (!lot) return null;
  if (lot.source_type === "purchase_invoice") {
    const item = items.find((row) => row.id === lot.po_item_id) ?? items.find((row) => row.variant_id === lot.variant_id);
    if (item?.base_unit_cost_currency !== undefined && item.base_unit_cost_currency > 0 && item.currency_code) {
      return { value: decimal(item.base_unit_cost_currency), currency: item.currency_code };
    }
    return null;
  }
  return lot.purchase_cost !== undefined && lot.purchase_cost > 0 ? { value: decimal(lot.purchase_cost), currency: "IQD" } : null;
}

/** The location new stock goes to, given the product's newest lot. */
export function restockLocation(newest: LotFacts | null, locations: readonly LocationInfo[]): string {
  const active = locations.filter((info) => info.active);
  const used = newest?.batch_stock?.map((row) => row.location_id).find((id) => active.some((info) => info.id === id));
  if (used) return used;
  const sellable = active.filter((info) => info.sellable);
  if (sellable.length === 1) return sellable[0].id;
  if (active.length === 1) return active[0].id;
  return sellable[0]?.id ?? active[0]?.id ?? "";
}

/**
 * Suppliers for the picker: those bought from recently first (newest first,
 * once each, active only), then everyone else by name.
 */
export function orderSuppliers(suppliers: readonly Supplier[], recentIds: readonly string[]): { recent: Supplier[]; others: Supplier[] } {
  const active = suppliers.filter((supplier) => supplier.is_active);
  const byId = new Map(active.map((supplier) => [supplier.id, supplier]));
  const recent: Supplier[] = [];
  for (const id of recentIds) {
    const supplier = byId.get(id);
    if (supplier && !recent.includes(supplier)) recent.push(supplier);
  }
  const others = active.filter((supplier) => !recent.includes(supplier)).sort((a, b) => a.name.localeCompare(b.name));
  return { recent, others };
}

/** Supplier ids from invoices listed newest first, each once. */
export function recentSupplierIds(invoices: ReadonlyArray<{ supplier_id?: string | null }>): string[] {
  const ids: string[] = [];
  for (const invoice of invoices) {
    if (invoice.supplier_id && !ids.includes(invoice.supplier_id)) ids.push(invoice.supplier_id);
  }
  return ids;
}

/* --------------------------------------------------------------- lines */

/** A line nobody filled in: no quantity, or 0. It is left out, never refused. */
export function isBlankQuantity(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return true;
  const value = Number(trimmed);
  return Number.isFinite(value) && value === 0;
}

/** The lines that go into the document, and how many were left out. */
export function linesToPost<T>(lines: readonly T[], quantity: (line: T) => string | null | undefined): { posted: T[]; skipped: number } {
  const posted = lines.filter((line) => !isBlankQuantity(quantity(line)));
  return { posted, skipped: lines.length - posted.length };
}

/** The cost a prefilled line starts with: the last cost, when it is in the invoice's currency. */
export function startingCost(last: LastCost | null, currency: CurrencyCode): string {
  return last && last.currency === currency ? last.value : "";
}
