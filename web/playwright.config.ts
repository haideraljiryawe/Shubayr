import { defineConfig } from "@playwright/test";

/**
 * The suite is hermetic by default.
 *
 * Some specs import src/lib/api directly and run in this Node process rather
 * than in the browser, so the flag has to be set here — before any spec is
 * imported — and not only on the dev server below. Without it those specs
 * would inherit the per-domain default (catalog live) and hit a real API that
 * may not be running. live-catalog.spec.ts is unaffected: it talks to the API
 * URL directly and skips itself when nothing answers.
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
          "**/account.spec.ts",
          "**/account-wishlist.spec.ts",
          "**/account-returns.spec.ts",
          "**/account-reviews.spec.ts",
          "**/order-lifecycle.spec.ts",
          "**/work-account.spec.ts",
          "**/forwarding-rules.spec.ts",
          // Skips itself unless a real backend is reachable.
          "**/live-catalog.spec.ts",
          "**/live-checkout.spec.ts",
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
            // a trusted CDN hop at 192.0.2.10; no read cache, so every render
            // reaches the scripted API and its headers can be checked.
            TRUSTED_FRONT_PROXIES: "loopback,192.0.2.10",
            STORE_CACHE_SHARED_SECONDS: "0",
            STORE_CACHE_CATALOG_SECONDS: "0",
          }
        : {}),
    },
  },
});
