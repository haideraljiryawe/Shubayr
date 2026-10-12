// Refresh the committed screenshots under docs/screenshots.
//
// `npm test` writes its screenshots to test-results/screenshots (ignored), so
// a test run never changes tracked files. This runs only the screenshot specs
// with DOCS_SCREENSHOTS=1, which points them at docs/screenshots instead.
// Extra arguments go to Playwright (e.g. `npm run docs:screenshots -- --grep cart`).
import { spawnSync } from "node:child_process";

const args = ["playwright", "test", "--grep", "screenshots", ...process.argv.slice(2)];
const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DOCS_SCREENSHOTS: "1" },
});
process.exit(result.status ?? 1);
