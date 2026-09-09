import { defineConfig } from "@playwright/test";
const errors = process.env.CATALOG_ERROR_TESTS === "true";
const streaming = process.env.CATALOG_STREAMING_TESTS === "true";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? 3101);
export default defineConfig({
  testDir: "./tests",
  testMatch: errors
    ? "**/catalog-errors.spec.ts"
    : streaming
      ? "**/catalog-streaming.spec.ts"
      : [
          "**/catalog.spec.ts",
          "**/catalog-data.spec.ts",
          "**/product.spec.ts",
          "**/cart.spec.ts",
          "**/checkout.spec.ts",
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
      NEXT_PUBLIC_USE_MOCKS: errors || streaming ? "false" : "true",
      NEXT_PUBLIC_API_URL: streaming
        ? `http://127.0.0.1:${apiPort}/api/v1`
        : "http://127.0.0.1:1/api/v1",
    },
  },
});
