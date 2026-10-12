/**
 * Runs once when the server starts. A production admin must know where the
 * API is and which origin it is served from (the CSRF Origin check), so it
 * refuses to start without them rather than falling back to localhost.
 * Every variable is documented in docs/deploy/web-and-admin.md.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
