import { defineConfig } from "@playwright/test";
import live from "./playwright.live.config";

/**
 * Two live specs in a CHOSEN order, to prove they don't depend on each other.
 * With one worker Playwright sorts spec files by name, so the order is forced
 * with a project dependency instead (the second runs even if the first fails):
 *
 *   ORDER=auth,purchasing     npx playwright test --config playwright.order.config.ts
 *   ORDER=purchasing,auth     npx playwright test --config playwright.order.config.ts
 */
const [first, second] = (process.env.ORDER ?? "auth,purchasing").split(",").map((name) => name.trim());

export default defineConfig({
  ...live,
  projects: [
    { name: first!, testMatch: `**/${first}.spec.ts` },
    { name: second!, testMatch: `**/${second}.spec.ts`, dependencies: [first!] },
  ],
});
