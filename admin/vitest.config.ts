import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Unit tests: pure logic only, no browser and no API. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
