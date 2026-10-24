import { defineConfig } from "@playwright/test";

/**
 * Visual sanity checks for the Web Admin review (PR A13 foundation, PR A14 shell; the VIS IDs
 * in docs/reviews/web-admin-2026-10-22): Arabic and English, wide and narrow.
 * Each check asserts the layout rule it photographs, then writes
 * docs/reviews/web-admin-2026-10-22/a13-evidence/ or a14-evidence/<name>.<locale>.<width>.png.
 * Like the owner's-guide shots it is not part of `npm test` or the live suite:
 *
 *   ADMIN_LIVE_API=http://localhost:8000/api/v1 npm run test:visual
 *
 * Run it against a throwaway, seeded database (it reads; it creates nothing).
 */
const api = process.env.ADMIN_LIVE_API ?? "http://localhost:8000/api/v1";
process.env.ADMIN_LIVE_API = api;
process.env.ADMIN_LIVE_REQUIRED = "1";
const port = Number(process.env.ADMIN_VISUAL_PORT ?? 3300);
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: origin,
    browserName: "chromium",
    headless: true,
    deviceScaleFactor: 1,
  },
  webServer: {
    command: process.env.CI ? `npx next start --port ${port}` : `npx next dev --port ${port}`,
    url: `${origin}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      API_URL: api,
      ADMIN_ORIGIN: origin,
      ADMIN_COOKIE_SECURE: "true",
    },
  },
});
