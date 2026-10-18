/* ---------------------------------------------------------------------------
 * The sidebar, built from the signed-in user's CURRENT permissions.
 *
 * Each entry names the permission its screen's API calls require (the
 * `x-permission` in api/openapi.yaml). Hiding an entry is cosmetic only — the
 * pages call the API regardless and render a clean 403 when it refuses.
 * ------------------------------------------------------------------------- */

import { isNavEnabled, type ModuleKey } from "./modules";

export type NavKey =
  | "dashboard"
  | "orders"
  | "returns"
  | "deliveryParties"
  | "trips"
  | "products"
  | "categories"
  | "brands"
  | "banners"
  | "catalogImport"
  | "catalogImages"
  | "stock"
  | "movements"
  | "warehouses"
  | "openings"
  | "transfers"
  | "counts"
  | "writeDowns"
  | "suppliers"
  | "purchasing"
  | "supplierPayments"
  | "payables"
  | "currencies"
  | "cashAccounts"
  | "cashReceipts"
  | "expenses"
  | "expenseCategories"
  | "custodyExceptions"
  | "periods"
  | "ledger"
  | "settings"
  | "deliveryZones"
  | "discountTiers"
  | "staff"
  | "presets"
  | "workPhones"
  | "audit";

export interface NavItem {
  key: NavKey;
  href: string;
  /** Every one of these must be granted. Empty means any signed-in staff. */
  requires: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/", requires: [] },
  // The launch core comes first: catalog, stock, orders, settings, users.
  // Catalog v2 (API 8.0).
  { key: "products", href: "/catalog/products", requires: ["catalog.products"] },
  { key: "categories", href: "/catalog/categories", requires: ["catalog.categories"] },
  { key: "brands", href: "/catalog/brands", requires: ["catalog.brands"] },
  // Home banners (NOTE-001): the API guards them with catalog.products.
  { key: "banners", href: "/catalog/banners", requires: ["catalog.products"] },
  // Excel import and bulk images (API 15.1).
  { key: "catalogImport", href: "/catalog/import", requires: ["catalog.import"] },
  { key: "catalogImages", href: "/catalog/images", requires: ["catalog.import"] },
  // Inventory (API 8.2): every screen reads with inventory.view; each action
  // carries its own permission (manage, transfer, count, adjust, write_down).
  { key: "stock", href: "/inventory/stock", requires: ["inventory.view"] },
  { key: "openings", href: "/inventory/openings", requires: ["inventory.view"] },
  { key: "movements", href: "/inventory/movements", requires: ["inventory.view"] },
  { key: "warehouses", href: "/inventory/warehouses", requires: ["inventory.view"] },
  { key: "transfers", href: "/inventory/transfers", requires: ["inventory.view"] },
  { key: "counts", href: "/inventory/counts", requires: ["inventory.view"] },
  { key: "writeDowns", href: "/inventory/write-downs", requires: ["inventory.view"] },
  { key: "orders", href: "/orders", requires: ["orders.view"] },
  // Customer returns v2 (API 17.0): approve, receive, inspect, refund — each
  // step its own permission. Its own module, off at launch.
  { key: "returns", href: "/returns", requires: ["returns.view"] },
  { key: "settings", href: "/settings", requires: ["settings.manage"] },
  // Delivery pricing (API 15.0): zones and governorates, automatic discounts.
  { key: "deliveryZones", href: "/settings/delivery-zones", requires: ["delivery_zones.manage"] },
  { key: "discountTiers", href: "/settings/discounts", requires: ["discount_tiers.manage"] },
  { key: "staff", href: "/staff", requires: ["users.manage"] },
  { key: "presets", href: "/presets", requires: ["roles.manage"] },
  { key: "workPhones", href: "/work-phones", requires: ["users.manage"] },
  // Purchasing and suppliers (API 9.0): every read needs suppliers.view; each
  // document carries its own permission.
  { key: "suppliers", href: "/purchasing/suppliers", requires: ["suppliers.view"] },
  { key: "purchasing", href: "/purchasing/invoices", requires: ["suppliers.view"] },
  { key: "supplierPayments", href: "/purchasing/payments", requires: ["suppliers.view"] },
  { key: "payables", href: "/purchasing/reports", requires: ["suppliers.view"] },
  // Financial core (API 7.0).
  { key: "currencies", href: "/finance/currencies", requires: ["fx_rates.view"] },
  { key: "cashAccounts", href: "/finance/cash-accounts", requires: ["cash_accounts.view"] },
  { key: "periods", href: "/finance/periods", requires: ["ledger.view"] },
  { key: "ledger", href: "/finance/ledger", requires: ["ledger.view"] },
  // The delivery add-ons, each its own module (src/lib/modules.ts).
  // Delivery parties and their custody (API 11.2).
  { key: "deliveryParties", href: "/delivery-parties", requires: ["deliveries.manage"] },
  // External-driver trips (API 13.4).
  { key: "trips", href: "/deliveries/trips", requires: ["trips.view"] },
  // Lost goods, returns at the door and fee refunds (API 13.3).
  { key: "custodyExceptions", href: "/finance/custody-exceptions", requires: ["custody_exceptions.view"] },
  // Cash handed in by delivery parties (API 13.2).
  { key: "cashReceipts", href: "/finance/cash-receipts", requires: ["deliveries.manage"] },
  // Expenses (API 17.1): documents and their categories — its own module,
  // off at launch. Categories are managed with expense_categories.manage.
  { key: "expenses", href: "/expenses", requires: ["expenses.read"] },
  { key: "expenseCategories", href: "/expenses/categories", requires: ["expense_categories.manage"] },
  { key: "audit", href: "/audit", requires: ["audit.view"] },
];

/**
 * The entries the permissions open, within the enabled modules — all of them
 * when `modules` is omitted (see src/lib/modules.ts).
 */
export function visibleNav(
  permissions: readonly string[],
  items: readonly NavItem[] = NAV_ITEMS,
  modules?: readonly ModuleKey[],
): NavItem[] {
  const granted = new Set(permissions);
  return items.filter(
    (item) =>
      item.requires.every((key) => granted.has(key)) &&
      (!modules || isNavEnabled(item.key, modules)),
  );
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The one entry to highlight: the most specific match. Nested entries share a
 * prefix (/settings and /settings/delivery-zones), and only the deeper one is
 * the page the person is on.
 */
export function activeNavKey(items: readonly NavItem[], pathname: string): NavKey | null {
  return (
    items
      .filter((item) => isNavActive(item, pathname))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key ?? null
  );
}
