import type { NavKey } from "./nav";

/* ---------------------------------------------------------------------------
 * Admin modules: which areas of the back office this installation shows.
 *
 * ADMIN_MODULES (server environment) is a comma-separated list of module
 * keys. Unset, empty or "all" shows everything — the default, so an existing
 * installation changes nothing. A launch that starts with the core sets, for
 * example:
 *
 *   ADMIN_MODULES=catalog,stock,orders,settings,users
 *
 * and delivery parties, trips, custody exceptions and cash receipts (each its
 * own module) stay out of the menu, off the dashboard, and their routes
 * answer with a "not enabled" page until they are switched on as add-ons.
 *
 * This is presentation only. Permissions still decide who sees what inside
 * an enabled module, and the API still decides every call.
 * ------------------------------------------------------------------------- */

export const MODULES = [
  "catalog",
  "stock",
  "orders",
  "settings",
  "users",
  "purchasing",
  "finance",
  "deliveryParties",
  "trips",
  "custody",
  "cashReceipts",
  "audit",
] as const;

export type ModuleKey = (typeof MODULES)[number];

/** Each sidebar entry's module; the dashboard belongs to none and always shows. */
export const NAV_MODULE: Record<Exclude<NavKey, "dashboard">, ModuleKey> = {
  products: "catalog",
  categories: "catalog",
  brands: "catalog",
  catalogImport: "catalog",
  catalogImages: "catalog",
  stock: "stock",
  movements: "stock",
  warehouses: "stock",
  openings: "stock",
  transfers: "stock",
  counts: "stock",
  writeDowns: "stock",
  orders: "orders",
  settings: "settings",
  deliveryZones: "settings",
  discountTiers: "settings",
  staff: "users",
  presets: "users",
  workPhones: "users",
  suppliers: "purchasing",
  purchasing: "purchasing",
  supplierPayments: "purchasing",
  payables: "purchasing",
  currencies: "finance",
  cashAccounts: "finance",
  periods: "finance",
  ledger: "finance",
  deliveryParties: "deliveryParties",
  trips: "trips",
  custodyExceptions: "custody",
  cashReceipts: "cashReceipts",
  audit: "audit",
};

/**
 * Route prefixes per module, longest first where they nest (the custody and
 * cash-receipt screens live under /finance, trips under /deliveries).
 */
const ROUTES: ReadonlyArray<[prefix: string, owner: ModuleKey]> = [
  ["/finance/custody-exceptions", "custody"],
  ["/finance/cash-receipts", "cashReceipts"],
  ["/finance/price-approvals", "catalog"],
  ["/finance", "finance"],
  ["/deliveries", "trips"],
  ["/delivery-parties", "deliveryParties"],
  ["/catalog", "catalog"],
  ["/inventory", "stock"],
  ["/orders", "orders"],
  ["/retrievals", "orders"],
  ["/settings", "settings"],
  ["/staff", "users"],
  ["/presets", "users"],
  ["/work-phones", "users"],
  ["/purchasing", "purchasing"],
  ["/audit", "audit"],
];

/**
 * The enabled modules from ADMIN_MODULES. Unknown keys are ignored, and a
 * value that names no known module at all falls back to everything — a typo
 * must not leave the owner with an empty back office.
 */
export function parseModules(raw: string | null | undefined): ModuleKey[] {
  const text = (raw ?? "").trim();
  if (!text || text.toLowerCase() === "all") return [...MODULES];
  const wanted = new Set(
    text
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const known = MODULES.filter((key) => wanted.has(key));
  return known.length ? known : [...MODULES];
}

/** The module a page route belongs to, or null (dashboard, notifications…). */
export function routeModule(pathname: string): ModuleKey | null {
  for (const [prefix, owner] of ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return owner;
  }
  return null;
}

/** Whether a page route may be shown with these modules enabled. */
export function isRouteEnabled(pathname: string, enabled: readonly ModuleKey[]): boolean {
  const owner = routeModule(pathname);
  return owner === null || enabled.includes(owner);
}

/** Whether a sidebar entry's module is enabled. */
export function isNavEnabled(key: NavKey, enabled: readonly ModuleKey[]): boolean {
  return key === "dashboard" || enabled.includes(NAV_MODULE[key]);
}
