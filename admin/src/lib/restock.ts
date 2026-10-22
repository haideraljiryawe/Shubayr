import type { components } from "@/types/api";
import type { LocationInfo } from "@/lib/inventory";
import { fixedText, toFixed, type CurrencyCode } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * Restock (إعادة تعبئة المخزون): a purchase invoice prefilled from one
 * product, kept pure so the defaults and the line rules are unit-tested.
 *
 * - Every variant gets a line; a line left empty or at 0 is simply not part
 *   of the invoice, so restocking only the second colour is one quantity.
 * - The cost starts at what was last paid for that SKU: the API's latest
 *   posted purchase cost (GET /admin/purchase-costs/variants/{id}/last,
 *   cost.view), in that invoice's currency; for a SKU never purchased but
 *   entered as opening stock, that lot's cost in IQD.
 * - The location starts where the product's newest stock went (lots read
 *   newest-first from the API), if that location is still active, else the
 *   store's only — or only sellable — location.
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

/** GET /admin/purchase-costs/variants/{id}/last (null: never purchased). */
export type LastPurchase = components["schemas"]["LastVariantPurchaseCost"];

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

/**
 * What was last paid for a SKU: its latest posted purchase, else (never
 * purchased) the cost of its newest lot when that lot is opening stock.
 */
export function restockCost(last: LastPurchase | null, newest: LotFacts | null): LastCost | null {
  if (last && last.unit_cost > 0) return { value: decimal(last.unit_cost), currency: last.currency_code };
  if (newest && newest.source_type !== "purchase_invoice" && newest.purchase_cost !== undefined && newest.purchase_cost > 0) {
    return { value: decimal(newest.purchase_cost), currency: "IQD" };
  }
  return null;
}

/** The supplier the product was last bought from: the latest of its SKUs' last purchases. */
export function lastSupplierId(purchases: ReadonlyArray<LastPurchase | null>, newest: LotFacts | null): string {
  let best: LastPurchase | null = null;
  for (const row of purchases) if (row && (!best || row.received_at > best.received_at)) best = row;
  return best?.supplier.id ?? newest?.supplier_id ?? "";
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

/* ------------------------------------------------------------- paid now */

/**
 * The amount "paid now" will settle, shown before posting: the invoice total
 * in its own currency (lines plus landed costs). The request itself asks the
 * server to pay the full total (pay_full_invoice_total, 17.9.0), which also
 * converts landed costs in another currency; this preview is only possible
 * when every landed cost is in the invoice's currency, otherwise null and the
 * form says the server computes it.
 */
export function paidNowAmount(
  lineTotals: readonly bigint[],
  landed: ReadonlyArray<{ currency: CurrencyCode; amount: string }>,
  currency: CurrencyCode,
): string | null {
  if (landed.some((cost) => cost.currency !== currency)) return null;
  const total = [...lineTotals, ...landed.map((cost) => toFixed(cost.amount || "0"))].reduce((sum, value) => sum + value, 0n);
  // The API takes at most six decimals and rounds the same way.
  const amount = fixedText(total, 6);
  return toFixed(amount) > 0n ? amount : null;
}
