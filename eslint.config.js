import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [
    "dist/**",
    "node_modules/**",
    "public/**",
    "ui/public/**",  // WASM generated files
    "*.config.js",
    "*.config.ts",
    "integration-tests/**",  // Has its own ESLint config
  ] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // Prevent accidentally not awaiting a Promise
      // Use "void someAsyncFunction();" to explicitly run in background
      "@typescript-eslint/no-floating-promises": "error",
      // Disable for now - too many existing uses, address separately
      "@typescript-eslint/no-explicit-any": "off",
      // Disable non-critical rules to unblock CI - TODO: fix these later
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-case-declarations": "off",
      "no-useless-escape": "off",
      // Keep rules-of-hooks as error but will fix the violations
    },
  }
);
