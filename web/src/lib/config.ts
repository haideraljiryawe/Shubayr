/* ---------------------------------------------------------------------------
 * Storefront configuration.
 *
 * These are deployment settings, not code constants: a tenant changes them
 * without a rebuild of the components that read them. Anything the shared
 * contract owns (store name, currency, brand colour) comes from GET /settings
 * via ThemeProvider instead — only values the contract has no field for live
 * here, and they move to /settings the moment it grows one.
 * ------------------------------------------------------------------------- */

function envNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return raw !== undefined && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

/**
 * Flat delivery fee added to every order, matching the mockup's «رسوم التوصيل»
 * line. StoreSettings has no delivery_fee field yet; when it does, read it from
 * the theme and delete this.
 */
export const DELIVERY_FEE = envNumber(
  process.env.NEXT_PUBLIC_DELIVERY_FEE,
  5,
);
