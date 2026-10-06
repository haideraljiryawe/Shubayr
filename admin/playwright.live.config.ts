import { defineConfig } from "@playwright/test";

/**
 * The Web Admin in a real browser against a REAL, seeded API.
 *
 *   docker compose --profile full up -d        # api on :8000, migrated + seeded
 *   npm run test:live
 *
 * Point ADMIN_LIVE_API elsewhere to use another stack (a pinned throwaway one,
 * or CI's). Nothing answering there FAILS the run — see requireLiveApi in
 * tests/live/helpers.ts — because a live suite that skipped has verified
 * nothing.
 *
 * The admin talks to the API only from its own server (the BFF), so the API
 * URL goes to the web server's environment, not to the browser.
 */
const api = process.env.ADMIN_LIVE_API ?? "http://localhost:8000/api/v1";
process.env.ADMIN_LIVE_API = api;
process.env.ADMIN_LIVE_REQUIRED ??= "1";
const port = Number(process.env.ADMIN_E2E_PORT ?? 3300);
const origin = `http://localhost:${port}`;
// A second admin server that trusts no front proxy, so this runner is just a
// client connecting directly (tests/live/forwarding.spec.ts). It serves the
// same production build, so only in CI mode: two dev servers can't share one
// project directory.
const untrustedPort = port + 1;
const untrustedOrigin = `http://localhost:${untrustedPort}`;
if (process.env.CI) process.env.ADMIN_UNTRUSTED_ORIGIN = untrustedOrigin;

export default defineConfig({
  testDir: "./tests/live",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: origin,
    browserName: "chromium",
    headless: true,
    locale: "ar",
    // A failed test keeps its trace (test-results/), uploaded by CI.
    trace: "retain-on-failure",
  },
  // Keeps the API's log next to the report (LIVE_API_LOG_FILE / LIVE_API_CONTAINER).
  globalTeardown: "./tests/live/save-api-log.ts",
  // The specs share one seeded database and the API's rate limit.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  webServer: [{
    // CI builds first, then serves the production build; locally the dev
    // server is quicker to start from a clean checkout.
    command: process.env.CI
      ? `npx next start --port ${port}`
      : `npx next dev --port ${port}`,
    url: `${origin}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      API_URL: api,
      ADMIN_ORIGIN: origin,
      // Secure cookies on plain http://localhost: browsers treat localhost as
      // a secure context, so this also proves the production cookie flags.
      ADMIN_COOKIE_SECURE: "true",
      // The runner stands in for the admin's front proxy: the forwarding
      // spec sends client addresses through it (tests/live/forwarding.spec.ts).
      TRUSTED_FRONT_PROXIES: process.env.TRUSTED_FRONT_PROXIES ?? "loopback",
    },
  },
  ...(process.env.CI
    ? [
        {
          command: `npx next start --port ${untrustedPort}`,
          url: `${untrustedOrigin}/login`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            API_URL: api,
            ADMIN_ORIGIN: untrustedOrigin,
            ADMIN_COOKIE_SECURE: "true",
            TRUSTED_FRONT_PROXIES: "",
          },
        },
      ]
    : [])],
});
