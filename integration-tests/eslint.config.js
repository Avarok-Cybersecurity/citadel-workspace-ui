import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // playwright.config.ts is excluded from tsconfig.json's include list,
  // so project-aware parsing can't process it. Ignore it here so we
  // don't have to add a duplicate tsconfig just to satisfy the linter.
  { ignores: ["dist/**", "node_modules/**", "playwright.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // Prevent accidentally not awaiting a Promise
      "@typescript-eslint/no-floating-promises": "error",
      // Tests may use any for mocking
      "@typescript-eslint/no-explicit-any": "off",
      // Tests may use @ts-ignore for intentional type bypasses
      "@typescript-eslint/ban-ts-comment": "off",
      // Tests may have complex finally blocks
      "no-unsafe-finally": "off",
      // Playwright's fixture API requires `async ({}, use) => ...` for
      // fixtures that don't depend on any other fixture. The rule can't
      // distinguish this idiom from a genuine empty-pattern bug, so
      // disable it here rather than scattering disable comments across
      // every fixture file.
      "no-empty-pattern": "off",
    },
  }
);
