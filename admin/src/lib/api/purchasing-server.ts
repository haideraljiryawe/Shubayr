import "server-only";
import { load, type serverApi } from "./server";
import type { CurrencyCode, PurchaseInvoice, Supplier } from "@/lib/purchasing";

/* ---------------------------------------------------------------------------
 * Reads the purchasing pages share.
 *
 * GET /admin/suppliers pages but cannot search or filter by status (API
 * 9.0), so a supplier picker reads the first pages and offers the active
 * suppliers among them. Rates and cash accounts are read only with the
 * permissions their routes require (ledger.view, cash_accounts.manage).
 * ------------------------------------------------------------------------- */

type Api = Awaited<ReturnType<typeof serverApi>>;

const PICKER_PAGES = 5;

/** Up to 500 suppliers for a picker, active first. */
export async function loadSupplierOptions(api: Api): Promise<{ suppliers: Supplier[]; complete: boolean }> {
  const suppliers: Supplier[] = [];
  for (let page = 1; page <= PICKER_PAGES; page += 1) {
    const result = await load(api.GET("/admin/suppliers", { params: { query: { page, per_page: 100 } } }));
    if (!result.ok) return { suppliers, complete: false };
    suppliers.push(...result.data.data);
    if (suppliers.length >= result.data.total || result.data.data.length === 0) return { suppliers: sortSuppliers(suppliers), complete: true };
  }
  return { suppliers: sortSuppliers(suppliers), complete: false };
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
 * ledger.view, or none recorded). The server resolves it at 00:00 UTC of the
 * document date, so the same instant is asked here.
 */
export async function loadApplicableRate(api: Api, code: CurrencyCode, day: string): Promise<string | null> {
  if (code === "IQD") return "1";
  const result = await load(
    api.GET("/admin/exchange-rates/{code}/applicable", {
      params: { path: { code }, query: { at: `${day}T00:00:00.000Z` } },
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
