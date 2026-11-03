import { defineConfig } from "@playwright/test";

/**
 * Review screenshots for PR W1 (banners, Recently Added, the per-order
 * maximum, the sign-in countdown and attempts), on the mock-backed store, in
 * Arabic and English at desktop and phone width. Each shot is preceded by the
 * rule it shows. Not part of `npm test`; writes
 * docs/reviews/web-store-w1-evidence/:
 *
 *   npx playwright test --config playwright.evidence.config.ts
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/evidence",
  timeout: 120000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "chromium",
    headless: true,
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_USE_MOCKS: "true",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:1/api/v1",
    },
  },
});
