import { defineConfig } from "@playwright/test";

/**
 * The purchase funnel, driven through a real browser against a REAL backend.
 *
 * Separate from playwright.config.ts because the two want opposite things: the
 * default suite forces NEXT_PUBLIC_USE_MOCKS=true so it stays hermetic, and
 * this one must have it off with the funnel's domains live. A Playwright
 * `webServer` takes one environment, so it takes two configs.
 *
 *   docker compose --profile full up -d        # then seed it
 *   npm run test:live
 *
 * In CI (CI=true) it serves the production build (`npm run build` first, with
 * the same NEXT_PUBLIC_* values) instead of the dev server: faster pages, and
 * the code that ships.
 *
 * Point PLAYWRIGHT_LIVE_API elsewhere to run against another stack. Nothing
 * answering there FAILS the run: this config exists to exercise a real API, and
 * a live run that skipped because it reached none would report green having
 * verified nothing. (The hermetic suite still skips its opportunistic live
 * specs — see requireLiveApi in tests/live-api.ts.)
 */
const api = process.env.PLAYWRIGHT_LIVE_API ?? "http://localhost:8000/api/v1";

// live-checkout.spec.ts reads NEXT_PUBLIC_API_URL and runs in THIS process, not
// in the dev server's, so the two specs would otherwise disagree about which
// backend "live" means.
process.env.NEXT_PUBLIC_API_URL = api;
// Read by requireLiveApi in the workers, which inherit this process's env.
process.env.PLAYWRIGHT_LIVE_REQUIRED ??= "1";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const ci = process.env.CI === "true";
// The worker's slot (set in each worker process, which loads this config too).
const slot = Number(process.env.TEST_PARALLEL_INDEX ?? "0");

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/live-funnel.spec.ts",
    "**/live-catalog-v2.spec.ts",
    "**/live-checkout.spec.ts",
    "**/live-account.spec.ts",
    "**/live-wishlist.spec.ts",
    "**/live-work-account.spec.ts",
    "**/live-work-pages.spec.ts",
    "**/live-lifecycle.spec.ts",
    "**/live-privacy.spec.ts",
  ],
  timeout: 90000,
  use: {
    baseURL: `http://localhost:${port}`,
    // Each worker is a separate client to the API's per-address rate limit,
    // as separate shoppers would be: a documentation-range address per
    // worker, which the API honours only when it trusts this runner as a
    // proxy (TRUSTED_PROXIES=loopback in CI). Otherwise it is ignored and the
    // workers share one budget.
    extraHTTPHeaders: { "X-Forwarded-For": `198.51.100.${10 + slot}` },
    browserName: "chromium",
    headless: true,
  },
  // Each worker signs in as its own customer, agent and monitor (see
  // tests/live-api.ts), so tests run in parallel, any test on any worker.
  // LIVE_WORKERS overrides the count.
  workers: Number(process.env.LIVE_WORKERS ?? 4),
  fullyParallel: true,
  projects: [
    { name: "parallel", grepInvert: /@global/ },
    // Store-wide state (every monitor sees every order and is notified of
    // it): these run after the rest, with nothing else running.
    { name: "global", grep: /@global/, dependencies: ["parallel"], fullyParallel: false },
  ],
  webServer: {
    command: ci ? `npx next start --port ${port}` : `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_USE_MOCKS: "false",
      // Every domain, exactly as this repo flips them — wishlist included
      // since the backend module landed (#55), and the build-phase-2 work
      // pages and inbox since API 6.1 (#58).
      NEXT_PUBLIC_LIVE_DOMAINS:
        "auth,profile,catalog,banners,cart,checkout,orders,addresses," +
        "returns,loyalty,reviews,notifications,wishlist,monitor,deliveries,inbox",
      NEXT_PUBLIC_API_URL: api,
      // next start re-reads next.config: the production build's guard and its
      // image host need these at start as well as at build.
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${port}`,
      IMAGES_ALLOW_LOCAL_IP: "true",
    },
  },
});
