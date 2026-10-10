/**
 * Serves the REAL components, unmodified, on a bare page, so a gate can measure what a browser
 * lays out instead of what jsdom (which has no layout) asserts.
 *
 * Not the app: no router, no agent, no WASM. The components under test are imported from
 * `src/` through the same `@` alias and the same Tailwind/PostCSS pipeline the app uses, so the
 * classes that decide spacing are the shipped ones. What a scenario fakes is its INPUT (a
 * roster, a message list), never the component.
 */
import { build, preview } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import react from '@vitejs/plugin-react-swc';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(HERE, '..', '..', '..');

/** The WASM client is built by wasm-pack and absent from a clean checkout; nothing here calls it. */
const WASM_STUB = '\0wasm-stub';
const stubWasmClient = () => ({
  name: 'stub-wasm-client',
  resolveId: (id) => (/citadel[-_]internal[-_]service[-_]wasm[-_]client/.test(id) ? { id: WASM_STUB, moduleSideEffects: false } : undefined),
  load: (id) => (id === WASM_STUB ? 'export default {}' : undefined),
});

/**
 * Built once, then served as static files. A dev server transforms modules on first request and keeps an HMR
 * socket open; a page whose first render raced either one came up blank (its socket failed at ~90 ms, the vite
 * client polled for a "restart" and reloaded the page under the measurement, aborting its module loads), and
 * only a later, clean page rendered. A built bundle has neither a compile to race nor a socket to lose, so the
 * first render is the only render.
 */
export async function serveHarness(port) {
  const outDir = mkdtempSync(join(tmpdir(), 'polish-harness-'));
  await build({
    root: HERE,
    configFile: false,
    logLevel: 'error',
    plugins: [react(), stubWasmClient()],
    css: { postcss: APP_ROOT },
    resolve: {
      alias: {
        '@': resolve(APP_ROOT, 'src'),
        'virtual:pwa-register/react': resolve(APP_ROOT, 'src/test/pwa-register-stub.ts'),
        'virtual:pwa-register': resolve(APP_ROOT, 'src/test/pwa-register-stub.ts'),
      },
    },
    build: { outDir, emptyOutDir: true, minify: false, chunkSizeWarningLimit: 100_000 },
  });
  const server = await preview({ root: HERE, configFile: false, logLevel: 'error', build: { outDir }, preview: { port, strictPort: true } });
  return {
    origin: `http://localhost:${port}`,
    close: async () => { await server.close(); rmSync(outDir, { recursive: true, force: true }); },
  };
}
