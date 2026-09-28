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

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/live-funnel.spec.ts",
    "**/live-checkout.spec.ts",
    "**/live-account.spec.ts",
    "**/live-wishlist.spec.ts",
    "**/live-work-account.spec.ts",
  ],
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
      // Every domain, exactly as this repo flips them — wishlist included
      // since the backend module landed (#55).
      NEXT_PUBLIC_LIVE_DOMAINS:
        "auth,profile,catalog,banners,cart,checkout,orders,addresses," +
        "returns,loyalty,reviews,notifications,wishlist",
      NEXT_PUBLIC_API_URL: api,
    },
  },
});
