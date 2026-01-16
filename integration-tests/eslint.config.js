import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
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
    },
  }
);
