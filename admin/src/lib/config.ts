/* ---------------------------------------------------------------------------
 * Server configuration. Read only on the server (route handlers, the proxy
 * and server components) — nothing here is NEXT_PUBLIC, because the browser
 * never calls the API directly.
 * ------------------------------------------------------------------------- */

export const API_URL = (
  process.env.API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");

/** The public origin of this admin, for the CSRF Origin check. */
export const ADMIN_ORIGIN =
  process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || null;

/** Secure cookies unless explicitly turned off for plain-HTTP dev hosts. */
export const COOKIE_SECURE = process.env.ADMIN_COOKIE_SECURE !== "false";
