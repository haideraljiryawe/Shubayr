import { defineConfig } from "@playwright/test";

/**
 * The PRODUCTION server's output: security headers and the CSP nonce, no CSP
 * violations while pages hydrate, robots.txt, sitemap.xml, structured data,
 * canonical URLs and the 404 page. Runs `next start` on a build made first:
 *
 *   NEXT_PUBLIC_API_URL=https://api.example.test/api/v1 \
 *   NEXT_PUBLIC_SITE_URL=http://localhost:3102 NEXT_PUBLIC_USE_MOCKS=true \
 *   npm run build && npm run test:prod
 *
 * Mocked catalog data keeps it hermetic (CI has no API in this job); the
 * headers, metadata and documents are what a real deployment serves.
 */
const port = Number(process.env.PLAYWRIGHT_PROD_PORT ?? 3102);

export default defineConfig({
  testDir: "./tests/prod",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "chromium",
    headless: true,
  },
  workers: 1,
  webServer: {
    command: `npx next start --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
