import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests: pure logic, plus the shared UI primitives rendered in jsdom
 * (files that opt in with a `@vitest-environment jsdom` comment). No browser
 * and no API.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
    setupFiles: ["tests/unit/setup.ts"],
  },
});
