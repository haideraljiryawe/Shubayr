/* ---------------------------------------------------------------------------
 * The sidebar, built from the signed-in user's CURRENT permissions.
 *
 * Each entry names the permission its screen's API calls require (the
 * `x-permission` in api/openapi.yaml). Hiding an entry is cosmetic only — the
 * pages call the API regardless and render a clean 403 when it refuses.
 * ------------------------------------------------------------------------- */

export type NavKey =
  | "dashboard"
  | "orders"
  | "deliveryParties"
  | "trips"
  | "products"
  | "categories"
  | "brands"
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
  | "custodyExceptions"
  | "periods"
  | "ledger"
  | "settings"
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
  { key: "orders", href: "/orders", requires: ["orders.view"] },
  // Delivery parties and their custody (API 11.2).
  { key: "deliveryParties", href: "/delivery-parties", requires: ["deliveries.manage"] },
  // External-driver trips (API 13.4).
  { key: "trips", href: "/deliveries/trips", requires: ["trips.view"] },
  // Catalog v2 (API 8.0).
  { key: "products", href: "/catalog/products", requires: ["catalog.products"] },
  { key: "categories", href: "/catalog/categories", requires: ["catalog.categories"] },
  { key: "brands", href: "/catalog/brands", requires: ["catalog.brands"] },
  // Inventory (API 8.2): every screen reads with inventory.view; each action
  // carries its own permission (manage, transfer, count, adjust, write_down).
  { key: "stock", href: "/inventory/stock", requires: ["inventory.view"] },
  { key: "movements", href: "/inventory/movements", requires: ["inventory.view"] },
  { key: "warehouses", href: "/inventory/warehouses", requires: ["inventory.view"] },
  { key: "openings", href: "/inventory/openings", requires: ["inventory.view"] },
  { key: "transfers", href: "/inventory/transfers", requires: ["inventory.view"] },
  { key: "counts", href: "/inventory/counts", requires: ["inventory.view"] },
  { key: "writeDowns", href: "/inventory/write-downs", requires: ["inventory.view"] },
  // Purchasing and suppliers (API 9.0): every read needs suppliers.view; each
  // document carries its own permission.
  { key: "suppliers", href: "/purchasing/suppliers", requires: ["suppliers.view"] },
  { key: "purchasing", href: "/purchasing/invoices", requires: ["suppliers.view"] },
  { key: "supplierPayments", href: "/purchasing/payments", requires: ["suppliers.view"] },
  { key: "payables", href: "/purchasing/reports", requires: ["suppliers.view"] },
  // Financial core (API 7.0).
  { key: "currencies", href: "/finance/currencies", requires: ["fx_rates.view"] },
  { key: "cashAccounts", href: "/finance/cash-accounts", requires: ["cash_accounts.view"] },
  // Cash handed in by delivery parties (API 13.2).
  { key: "cashReceipts", href: "/finance/cash-receipts", requires: ["deliveries.manage"] },
  // Lost goods, returns at the door and fee refunds (API 13.3).
  { key: "custodyExceptions", href: "/finance/custody-exceptions", requires: ["custody_exceptions.view"] },
  { key: "periods", href: "/finance/periods", requires: ["ledger.view"] },
  { key: "ledger", href: "/finance/ledger", requires: ["ledger.view"] },
  { key: "settings", href: "/settings", requires: ["settings.manage"] },
  { key: "staff", href: "/staff", requires: ["users.manage"] },
  { key: "presets", href: "/presets", requires: ["roles.manage"] },
  { key: "workPhones", href: "/work-phones", requires: ["users.manage"] },
  { key: "audit", href: "/audit", requires: ["audit.view"] },
];

export function visibleNav(
  permissions: readonly string[],
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  const granted = new Set(permissions);
  return items.filter((item) => item.requires.every((key) => granted.has(key)));
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
