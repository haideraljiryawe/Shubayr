/* ---------------------------------------------------------------------------
 * Server configuration. Read only on the server (route handlers, the proxy
 * and server components) — nothing here is NEXT_PUBLIC, because the browser
 * never calls the API directly.
 * ------------------------------------------------------------------------- */

// Localhost is a development default only: in production instrumentation.ts
// refuses to start without API_URL (docs/deploy/web-and-admin.md).
export const API_URL = (
  process.env.API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000/api/v1")
).replace(/\/$/, "");

/** The public origin of this admin, for the CSRF Origin check. */
export const ADMIN_ORIGIN =
  process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || null;

/** Secure cookies unless explicitly turned off for plain-HTTP dev hosts. */
export const COOKIE_SECURE = process.env.ADMIN_COOKIE_SECURE !== "false";

/**
 * Which admin modules this installation shows (src/lib/modules.ts). Unset or
 * "all" shows everything; the launch uses LAUNCH_MODULES (trips and custody
 * exceptions off).
 */
export const ADMIN_MODULES = process.env.ADMIN_MODULES ?? "";

/**
 * This image's own release tag (`--build-arg RELEASE_VERSION` from the
 * release workflow, kept as an environment variable in admin/Dockerfile);
 * "dev" for a local or untagged build. The version shown is the API's
 * (src/lib/release-version.ts); this stands in only when the API is down.
 */
export const APP_VERSION = process.env.RELEASE_VERSION?.trim() || "dev";
