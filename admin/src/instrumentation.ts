/**
 * Runs once when the server starts. A production admin must know where the
 * API is and which origin it is served from (the CSRF Origin check), so it
 * refuses to start without them rather than falling back to localhost.
 * Every variable is documented in docs/deploy/web-and-admin.md.
 */
export function register() {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` loads this too; only a running server needs the settings.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const missing = ["API_URL", "ADMIN_ORIGIN"].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`The admin needs ${missing.join(" and ")} in production (see docs/deploy/web-and-admin.md).`);
  }
  for (const name of ["API_URL", "ADMIN_ORIGIN"]) new URL(process.env[name]!);
}
