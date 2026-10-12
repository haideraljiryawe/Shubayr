/**
 * Where the specs' screenshots go.
 *
 * By default into test-results/screenshots — Playwright's own output folder,
 * git-ignored and cleared at the start of every run — so `npm test` never
 * rewrites the PNGs committed under docs/screenshots. Those are refreshed
 * only on purpose: `npm run docs:screenshots` (DOCS_SCREENSHOTS=1).
 */
export const SCREENSHOT_DIR =
  process.env.DOCS_SCREENSHOTS === "1" ? "docs/screenshots" : "test-results/screenshots";
