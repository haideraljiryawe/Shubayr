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
  | "currencies"
  | "cashAccounts"
  | "periods"
  | "ledger"
  | "settings"
  | "staff"
  | "presets"
  | "workPhones";

export interface NavItem {
  key: NavKey;
  href: string;
  /** Every one of these must be granted. Empty means any signed-in staff. */
  requires: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/", requires: [] },
  { key: "orders", href: "/orders", requires: ["orders.view"] },
  // Financial core (API 7.0).
  { key: "currencies", href: "/finance/currencies", requires: ["ledger.view"] },
  { key: "cashAccounts", href: "/finance/cash-accounts", requires: ["cash_accounts.manage"] },
  { key: "periods", href: "/finance/periods", requires: ["ledger.view"] },
  { key: "ledger", href: "/finance/ledger", requires: ["ledger.view"] },
  { key: "settings", href: "/settings", requires: ["settings.manage"] },
  { key: "staff", href: "/staff", requires: ["users.manage"] },
  { key: "presets", href: "/presets", requires: ["roles.manage"] },
  { key: "workPhones", href: "/work-phones", requires: ["users.manage"] },
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
