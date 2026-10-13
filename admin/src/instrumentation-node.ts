export async function registerNode() {
  if (process.env.NODE_ENV !== "production") return;
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
  // A malformed TRUSTED_FRONT_PROXIES must stop the server, not quietly
  // trust nothing (or the wrong thing).
  const { checkTrustedFrontProxies } = await import("./lib/session/forwarding");
  try {
    checkTrustedFrontProxies(process.env.TRUSTED_FRONT_PROXIES);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "TRUSTED_FRONT_PROXIES is invalid");
  }
  if (problems.length) {
    // Next.js logs a thrown error here but keeps the process alive, serving
    // nothing; exit so the container restarts visibly instead.
    console.error(`The admin can't start in production: ${problems.join("; ")} (see docs/deploy/web-and-admin.md).`);
    process.exit(1);
  }
}
