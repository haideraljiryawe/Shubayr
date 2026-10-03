import "server-only";
import { load, type serverApi } from "./server";
import { exchangeRateCutoff } from "@/lib/finance/dates";
import type { CurrencyCode, PurchaseInvoice, Supplier } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * Reads the purchasing pages share.
 *
 * GET /admin/suppliers pages but cannot search or filter by status (API
 * 9.0), so a supplier picker reads the first pages and offers the active
 * suppliers among them. Rates and cash accounts are read only with the
 * permissions their routes require (fx_rates.view, cash_accounts.view).
 * ------------------------------------------------------------------------- */

type Api = Awaited<ReturnType<typeof serverApi>>;

const PICKER_PAGES = 5;

/**
 * Up to 500 suppliers for a picker, active first. A supplier the page was
 * opened for (`?supplier_id=`) is always included, even beyond those 500, so
 * the link still selects it however many suppliers exist.
 */
export async function loadSupplierOptions(api: Api, include?: string): Promise<{ suppliers: Supplier[]; complete: boolean }> {
  const suppliers: Supplier[] = [];
  let complete = false;
  for (let page = 1; page <= PICKER_PAGES; page += 1) {
    const result = await load(api.GET("/admin/suppliers", { params: { query: { page, per_page: 100 } } }));
    if (!result.ok) return { suppliers, complete: false };
    suppliers.push(...result.data.data);
    if (suppliers.length >= result.data.total || result.data.data.length === 0) {
      complete = true;
      break;
    }
  }
  if (include && !suppliers.some((supplier) => supplier.id === include)) {
    const one = await load(api.GET("/admin/suppliers/{id}", { params: { path: { id: include } } }));
    if (one.ok) suppliers.push(one.data as Supplier);
  }
  return { suppliers: sortSuppliers(suppliers), complete };
}

function sortSuppliers(rows: Supplier[]): Supplier[] {
  return [...rows].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
}

export async function loadInvoice(api: Api, id: string) {
  const result = await load(api.GET("/admin/purchase-invoices/{id}", { params: { path: { id } } }));
  return result.ok ? { ok: true as const, data: result.data as unknown as PurchaseInvoice } : result;
}

/**
 * The central rate the server applies to a document dated `day`, or null (no
 * fx_rates.view, no recorded rate, or an invalid date).
 */
export async function loadApplicableRate(api: Api, code: CurrencyCode, day: string): Promise<string | null> {
  if (code === "IQD") return "1";
  const at = exchangeRateCutoff(day);
  if (!at) return null;
  const result = await load(
    api.GET("/admin/exchange-rates/{code}/applicable", {
      params: { path: { code }, query: { at } },
    }),
  );
  if (!result.ok) return null;
  const rate = (result.data as { rate?: string | number }).rate;
  return rate === undefined || rate === null ? null : String(rate);
}

export interface CashAccountOption {
  id: string;
  name: string;
  currency_code: CurrencyCode;
  is_active: boolean;
}

export async function loadCashAccounts(api: Api): Promise<CashAccountOption[] | null> {
  const result = await load(api.GET("/admin/cash-accounts"));
  if (!result.ok) return null;
  return result.data
    .filter((account) => account.currency_code === "IQD" || account.currency_code === "USD")
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency_code: account.currency_code as CurrencyCode,
      is_active: account.is_active,
    }));
}

/** Backdating window: from store settings when readable, else the API default. */
export async function loadBackdatingWindow(api: Api): Promise<number> {
  const result = await load(api.GET("/admin/settings"));
  if (!result.ok) return 90;
  const raw = (result.data as { settings?: Record<string, unknown> }).settings?.backdating_window_days;
  const days = Number(raw);
  return Number.isFinite(days) && days > 0 ? days : 90;
}
