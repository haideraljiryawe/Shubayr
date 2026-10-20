import { defineConfig } from "@playwright/test";

/**
 * The suite is hermetic by default.
 *
 * Some specs import src/lib/api directly and run in this Node process rather
 * than in the browser, so the flag has to be set here — before any spec is
 * imported — and not only on the dev server below. Without it those specs
 * would inherit the per-domain default (catalog live) and hit a real API that
 * may not be running. Specs that need a real API live in the live suite.
 *
 * CI runs every mode here (the "Web store hermetic" job): the default list,
 * CATALOG_ERROR_TESTS, CATALOG_STREAMING_TESTS and WORK_TESTS.
 */
process.env.NEXT_PUBLIC_USE_MOCKS ??= "true";

const errors = process.env.CATALOG_ERROR_TESTS === "true";
const streaming = process.env.CATALOG_STREAMING_TESTS === "true";
// The work pages and the inbox, driven fully "live" against the scripted API
// in tests/fake-api.ts: `WORK_TESTS=true npx playwright test`.
const work = process.env.WORK_TESTS === "true";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? 3101);
export default defineConfig({
  testDir: "./tests",
  testMatch: errors
    ? "**/catalog-errors.spec.ts"
    : streaming
      ? "**/catalog-streaming.spec.ts"
      : work
        ? ["**/work-pages.spec.ts", "**/inbox.spec.ts", "**/forwarding.spec.ts"]
        : [
          "**/catalog.spec.ts",
          "**/catalog-data.spec.ts",
          "**/catalog-v2.spec.ts",
          "**/product.spec.ts",
          "**/cart.spec.ts",
          "**/checkout.spec.ts",
          "**/delivery-pricing.spec.ts",
          "**/account.spec.ts",
          "**/account-wishlist.spec.ts",
          "**/account-returns.spec.ts",
          "**/account-reviews.spec.ts",
          "**/order-lifecycle.spec.ts",
          "**/work-account.spec.ts",
          "**/forwarding-rules.spec.ts",
          "**/legal.spec.ts",
          "**/store-info-rules.spec.ts",
          "**/account-deletion-rules.spec.ts",
          // live-catalog and live-checkout need a real API: they run in the
          // live suite (playwright.live.config.ts), not skipped here.
        ],
  timeout: 60000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "chromium",
    headless: true,
  },
  workers: 1,
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_USE_MOCKS: errors || streaming || work ? "false" : "true",
      ...(work ? { NEXT_PUBLIC_LIVE_DOMAINS: "all" } : {}),
      NEXT_PUBLIC_API_URL:
        streaming || work
          ? `http://127.0.0.1:${apiPort}/api/v1`
          : "http://127.0.0.1:1/api/v1",
      ...(work
        ? {
            // forwarding.spec.ts: the runner is the store's front proxy, with
            // a trusted CDN hop at 192.0.2.10.
            TRUSTED_FRONT_PROXIES: "loopback,192.0.2.10",
          }
        : {}),
      // No read cache against a scripted API: every render must reach it
      // (headers checked, requests held back while streaming is observed).
      ...(work || streaming ? { STORE_CACHE_SHARED_SECONDS: "0", STORE_CACHE_CATALOG_SECONDS: "0" } : {}),
    },
  },
});
