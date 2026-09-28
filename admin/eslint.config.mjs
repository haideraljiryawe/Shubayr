import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/** eslint-config-next 16 ships flat config, so it is spread in directly. */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "test-results/**",
      "playwright-report/**",
      // Generated from ../api/openapi.yaml — never hand-edited, never linted.
      "src/types/api.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
