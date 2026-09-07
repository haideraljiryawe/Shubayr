import { defineConfig } from "@playwright/test";
const errors = process.env.CATALOG_ERROR_TESTS === "true";
export default defineConfig({
  testDir: "./tests",
  testMatch: errors
    ? "**/catalog-errors.spec.ts"
    : ["**/catalog.spec.ts", "**/catalog-data.spec.ts"],
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    headless: true,
  },
  workers: 1,
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_USE_MOCKS: errors ? "false" : "true",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:1/api/v1",
    },
  },
});
