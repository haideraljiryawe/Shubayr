import { defineConfig } from "@playwright/test";
import { LAUNCH_MODULES } from "./src/lib/modules";

/**
 * Screenshots for the owner's guide (docs/owner-guide), taken from the real
 * admin against a real, seeded API — not a test suite, so it is never part of
 * `npm test` or `npm run test:live`:
 *
 *   ADMIN_DOCS_API=http://localhost:8000/api/v1 npm run docs:screenshots
 *
 * It creates its own demo catalog, zones and tiers (use a throwaway
 * database), then writes docs/owner-guide/images/<name>.<locale>.png.
 */
const api = process.env.ADMIN_DOCS_API ?? "http://localhost:8000/api/v1";
process.env.ADMIN_LIVE_API = api;
process.env.ADMIN_LIVE_REQUIRED = "1";
const port = Number(process.env.ADMIN_DOCS_PORT ?? 3300);
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/docs",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: origin,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npx next dev --port ${port}`,
    url: `${origin}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The launch configuration: the core modules only.
    env: {
      API_URL: api,
      ADMIN_ORIGIN: origin,
      ADMIN_COOKIE_SECURE: "true",
      ADMIN_MODULES: process.env.ADMIN_MODULES ?? LAUNCH_MODULES,
    },
  },
});
