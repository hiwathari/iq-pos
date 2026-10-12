import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone operational script, not part of the Next.js app bundle — runs via plain `node`
    // on a restaurant's own device (e.g. Termux), so it's deliberately CommonJS/require() with no
    // build step. See docs/DEVELOPER_GUIDE.md §7.7.
    "scripts/local-print-bridge.js",
  ]),
]);

export default eslintConfig;
