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
  const problems = ["API_URL", "ADMIN_ORIGIN"].flatMap((name) => {
    const value = process.env[name]?.trim();
    if (!value) return [`${name} is not set`];
    try {
      new URL(value);
      return [];
    } catch {
      return [`${name} is not a URL`];
    }
  });
  if (problems.length) {
    // Next.js logs a thrown error here but keeps the process alive, serving
    // nothing; exit so the container restarts visibly instead.
    console.error(`The admin can't start in production: ${problems.join("; ")} (see docs/deploy/web-and-admin.md).`);
    process.exit(1);
  }
}
