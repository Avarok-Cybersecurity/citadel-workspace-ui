import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
      "unused-imports": unusedImports,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Accessibility. Previously unenforced, which is why aria-* appeared in
      // only 10 of ~207 component files and several <img> shipped with no alt.
      ...jsxA11y.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      // Disabled: HMR optimization warning, not code quality issue
      // Many UI components legitimately export variants alongside components
      "react-refresh/only-export-components": "off",
      // Re-enabled. With this off, dead variables, unused imports and orphaned
      // parameters accumulate invisibly — which is how several unreferenced modules
      // survived in this tree. Unused *imports* are delegated to unused-imports,
      // which (unlike the base rule) can auto-fix them, so `eslint --fix` keeps the
      // bundle free of dead imports. `_`-prefixed names stay exempt for the
      // genuinely-unused-by-design cases: unused catch bindings, and positional
      // parameters that exist only to satisfy a shared prop type.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["error", {
        args: "after-used",
        argsIgnorePattern: "^_",
        vars: "all",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      // Prevent accidentally not awaiting a Promise
      // Use "void someAsyncFunction();" to explicitly run in background
      "@typescript-eslint/no-floating-promises": "error",
      // Disable for now - too many existing uses, address separately
      "@typescript-eslint/no-explicit-any": "off",
      // Disable non-critical rules to unblock CI - TODO: fix these later
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      // Keep the design system from eroding again. The app previously carried 647
      // hardcoded hex colours across 130 files — five competing "background"
      // values among them — while the tokens in index.css went unused, which is
      // why a theme switch was impossible. Use bg-card / text-muted-foreground /
      // border-border instead; add a token if none of them fit.
      "no-restricted-syntax": ["error", {
        selector: "JSXAttribute[name.name='className'] Literal[value=/\\[#[0-9A-Fa-f]{6}\\]/]",
        message: "Hardcoded hex colour in className. Use a design token (bg-card, text-muted-foreground, border-border, bg-surface, text-primary-accent) — see src/index.css.",
      }, {
        selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/\\[#[0-9A-Fa-f]{6}\\]/]",
        message: "Hardcoded hex colour in className. Use a design token — see src/index.css.",
      }],
      "no-case-declarations": "off",
      "no-useless-escape": "off",
      // Keep rules-of-hooks as error but will fix the violations
    },
  }
);
