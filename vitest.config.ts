/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

/**
 * Stubs the wasm-pack generated WASM client JS file that doesn't exist in CI
 * (built by wasm-pack from Rust, not by npm run build). Prevents Vite's import
 * analysis from failing when resolving transitive imports through the WASM client.
 */
function stubWasmClient(): Plugin {
  return {
    name: 'stub-wasm-client',
    resolveId(id) {
      if (id.includes('citadel_internal_service_wasm_client')) {
        return { id: '\0wasm-stub', moduleSideEffects: false };
      }
    },
    load(id) {
      if (id === '\0wasm-stub') {
        return 'export default {}';
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stubWasmClient()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Exclude integration tests that are meant to be run as standalone scripts
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'integration-tests/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
