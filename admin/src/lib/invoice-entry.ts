import type { PickedSku } from "@/components/inventory/sku-picker";
import { baseQuantityError, packConversion, toFixed } from "./purchasing";
import type { LastCost } from "./restock";

/* ---------------------------------------------------------------------------
 * Purchase-invoice product entry (VIS-022): one editor above a compact list
 * of "invoice products". The editor adds a product (one summary row) or edits
 * a row in place; it never posts anything — posting stays the review step.
 *
 * Kept pure so add / edit / cancel / remove are unit-tested. The rows are the
 * invoice's lines exactly as before (the draft stores them unchanged), so a
 * draft saved before this screen still opens. Repeated products are never
 * merged: two rows can differ by batch, location or cost.
 * ------------------------------------------------------------------------- */

export interface InvoiceLine {
  key: number;
  sku: PickedSku | null;
  packs: string;
  packSize: string;
  cost: string;
  locationId: string;
  lot: string;
  expiry: string;
  manual: string;
  /** Restock: what was last paid for this SKU (shown; used when the currency matches). */
  lastCost?: LastCost | null;
}

/** What the editor holds: a row without its key. */
export type InvoiceEntry = Omit<InvoiceLine, "key">;

export type EntryField = "sku" | "packs" | "packSize" | "cost";
/** Message keys under purchasing.invoice.errors. */
export type EntryProblem = "sku" | "packs" | "packSize" | "cost" | "decimals" | "wholeUnits";
export type EntryErrors = Partial<Record<EntryField, EntryProblem>>;

export function blankEntry(): InvoiceEntry {
  return { sku: null, packs: "", packSize: "1", cost: "", locationId: "", lot: "", expiry: "", manual: "" };
}

export function entryOf(line: InvoiceLine): InvoiceEntry {
  const { key: _key, ...entry } = line;
  void _key;
  return entry;
}

const TEXT_FIELDS = ["packs", "packSize", "cost", "locationId", "lot", "expiry", "manual"] as const;

/** The same product and the same typed values (whitespace aside). */
export function sameEntry(a: InvoiceEntry, b: InvoiceEntry): boolean {
  if ((a.sku?.variantId ?? null) !== (b.sku?.variantId ?? null)) return false;
  return TEXT_FIELDS.every((field) => (a[field] ?? "").trim() === (b[field] ?? "").trim());
}

/**
 * Whether the editor holds input that would be lost: in add mode anything
 * beyond a blank editor, in edit mode anything that differs from the row
 * being edited.
 */
export function entryIsDirty(entry: InvoiceEntry, editing: InvoiceLine | null): boolean {
  return !sameEntry(entry, editing ? entryOf(editing) : blankEntry());
}

/**
 * The editor's checks before a row is added or saved — the same rules the
 * invoice is reviewed with: a product, a quantity above zero, a pack size
 * above zero, a cost above zero, and a base quantity the SKU can take.
 */
export function validateEntry(entry: InvoiceEntry): EntryErrors {
  const errors: EntryErrors = {};
  if (!entry.sku) errors.sku = "sku";
  if (toFixed(entry.packs || "0") <= 0n) errors.packs = "packs";
  if (toFixed(entry.packSize || "0") <= 0n) errors.packSize = "packSize";
  if (toFixed(entry.cost || "0") <= 0n) errors.cost = "cost";
  if (!errors.packs && !errors.packSize && entry.sku) {
    const unit = baseQuantityError(packConversion(entry.packs, entry.packSize, entry.cost || "0").baseQuantity, entry.sku.wholeUnitsOnly);
    if (unit) errors.packs = unit;
  }
  return errors;
}

function tidy(entry: InvoiceEntry): InvoiceEntry {
  return {
    ...entry,
    packs: entry.packs.trim(),
    packSize: entry.packSize.trim() || "1",
    cost: entry.cost.trim(),
    lot: entry.lot.trim(),
    manual: entry.manual.trim(),
  };
}

/**
 * Add the editor's product as a new row (editingKey null), or put it back in
 * place of the row being edited — never a duplicate.
 */
export function upsertLine(
  lines: readonly InvoiceLine[],
  entry: InvoiceEntry,
  editingKey: number | null,
  nextKey: number,
): { lines: InvoiceLine[]; nextKey: number } {
  const clean = tidy(entry);
  if (editingKey !== null && lines.some((line) => line.key === editingKey)) {
    return { lines: lines.map((line) => (line.key === editingKey ? { ...clean, key: editingKey } : line)), nextKey };
  }
  return { lines: [...lines, { ...clean, key: nextKey }], nextKey: nextKey + 1 };
}

export function removeLine(lines: readonly InvoiceLine[], key: number): InvoiceLine[] {
  return lines.filter((line) => line.key !== key);
}

/**
 * Rows as a saved draft holds them: rows without a product (the blank line
 * the old screen always kept at the bottom) are not invoice products.
 */
export function restoredLines(lines: readonly InvoiceLine[] | undefined): InvoiceLine[] {
  return (lines ?? []).filter((line) => line.sku !== null);
}

/**
 * "Name · variant · SKU" for a product row, the search results and the
 * removal question, so similar variants stay distinguishable.
 */
export function productLabel(sku: PickedSku): string {
  return [sku.productName, sku.variantLabel, sku.sku].filter((part) => part && part.trim()).join(" · ");
}

/** A variant's distinguishing attributes ("Red · L"), from the API's attributes object. */
export function variantAttributes(attributes: Record<string, unknown> | null | undefined): string {
  if (!attributes) return "";
  return Object.values(attributes)
    .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
    .filter(Boolean)
    .join(" · ");
}
