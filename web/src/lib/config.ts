/* ---------------------------------------------------------------------------
 * Storefront configuration.
 *
 * These are deployment settings, not code constants: a tenant changes them
 * without a rebuild of the components that read them. Anything the shared
 * contract owns (store name, currency, brand colour) comes from GET /settings
 * via ThemeProvider instead — only values the contract has no field for live
 * here, and they move to /settings the moment it grows one.
 * ------------------------------------------------------------------------- */

// The delivery fee is no longer a setting here: it is the fee of the zone
// serving the order's governorate (API 15.0, src/lib/delivery.ts).

/**
 * The store's timezone. GET /monitor/orders reads `date_from`/`date_to` as
 * Asia/Baghdad calendar days (the contract fixes it; StoreSettings has no
 * timezone field yet), so the date filters, their "today" and every time the
 * work pages print are computed here rather than in the browser's own zone.
 */
export const STORE_TIME_ZONE = "Asia/Baghdad";
