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
 * Point PLAYWRIGHT_LIVE_API elsewhere to run against another stack. Every spec
 * skips itself when nothing answers there, so a checkout with no backend is a
 * skip rather than a wall of failures.
 */
const api = process.env.PLAYWRIGHT_LIVE_API ?? "http://localhost:8000/api/v1";

// live-checkout.spec.ts reads NEXT_PUBLIC_API_URL and runs in THIS process, not
// in the dev server's, so the two specs would otherwise disagree about which
// backend "live" means.
process.env.NEXT_PUBLIC_API_URL = api;
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/live-funnel.spec.ts", "**/live-checkout.spec.ts"],
  timeout: 90000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "chromium",
    headless: true,
  },
  // The funnel mutates one seeded customer's cart and orders, so the specs
  // must not race each other over it.
  workers: 1,
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_USE_MOCKS: "false",
      // The funnel, exactly as this PR flips it — the domains left on
      // fixtures stay on fixtures even here.
      NEXT_PUBLIC_LIVE_DOMAINS:
        "auth,profile,catalog,banners,cart,checkout,orders,addresses",
      NEXT_PUBLIC_API_URL: api,
    },
  },
});
