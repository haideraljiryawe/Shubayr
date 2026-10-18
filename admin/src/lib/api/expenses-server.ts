import "server-only";
import { load, listRows, type serverApi } from "./server";
import { loadBackdatingWindow, loadCashAccounts, loadSupplierOptions } from "./purchasing-server";
import { DEFAULT_PRECISION, type CashAccountChoice, type ExpenseCategory } from "@/lib/expenses";

type Api = Awaited<ReturnType<typeof serverApi>>;

export interface CurrencyChoice {
  code: string;
  precision: number;
  isBase: boolean;
}

export interface ExpenseContext {
  userId: string | null;
  permissions: string[];
  categories: ExpenseCategory[];
  /** Null: the person can't list cash accounts (cash_accounts.view). */
  cashAccounts: CashAccountChoice[] | null;
  currencies: CurrencyChoice[];
  /** Whether the currency list came from the API (fx_rates.view) or the defaults. */
  currenciesKnown: boolean;
  /** Strict separation of duties, when the settings are readable (settings.manage); else null. */
  strict: boolean | null;
  windowDays: number;
  /** Null: the person can't list suppliers (suppliers.view). */
  suppliers: Array<{ id: string; name: string }> | null;
}

/**
 * What the expense screens need besides the expense itself, each read only
 * when the person may read it: an unreadable part degrades to a clear
 * fallback instead of failing the page.
 */
export async function loadExpenseContext(api: Api, needs: { forms: boolean }): Promise<ExpenseContext> {
  const me = await load(api.GET("/me"));
  const permissions = me.ok ? (me.data.permissions ?? []) : [];
  const can = (key: string) => permissions.includes(key);

  const [categories, cashAccounts, currencies, settings, windowDays, suppliers] = await Promise.all([
    can("expenses.read") ? load(api.GET("/admin/expense-categories")) : Promise.resolve(null),
    can("cash_accounts.view") ? loadCashAccounts(api) : Promise.resolve(null),
    needs.forms && can("fx_rates.view") ? load(api.GET("/admin/currencies")) : Promise.resolve(null),
    can("settings.manage") ? load(api.GET("/admin/settings")) : Promise.resolve(null),
    needs.forms ? loadBackdatingWindow(api) : Promise.resolve(90),
    needs.forms && can("suppliers.view") ? loadSupplierOptions(api) : Promise.resolve(null),
  ]);

  const fromApi =
    currencies?.ok === true
      ? listRows(currencies.data)
          .filter((currency) => currency.enabled)
          .map((currency) => ({ code: currency.code, precision: currency.display_precision, isBase: currency.is_base }))
      : null;
  const level = settings?.ok ? settings.data.settings?.separation_of_duties_level : undefined;

  return {
    userId: me.ok ? (me.data.id ?? null) : null,
    permissions,
    categories: categories?.ok ? categories.data : [],
    cashAccounts,
    currencies: fromApi?.length
      ? fromApi
      : Object.entries(DEFAULT_PRECISION).map(([code, precision]) => ({ code, precision, isBase: code === "IQD" })),
    currenciesKnown: Boolean(fromApi?.length),
    strict: level === undefined || level === null ? (settings?.ok ? false : null) : level === "strict",
    windowDays,
    suppliers: suppliers ? suppliers.suppliers.filter((supplier) => supplier.is_active).map((supplier) => ({ id: supplier.id, name: supplier.name })) : null,
  };
}
