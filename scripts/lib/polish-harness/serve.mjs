/**
 * Serves the REAL components, unmodified, on a bare page, so a gate can measure what a browser
 * lays out instead of what jsdom (which has no layout) asserts.
 *
 * Not the app: no router, no agent, no WASM. The components under test are imported from
 * `src/` through the same `@` alias and the same Tailwind/PostCSS pipeline the app uses, so the
 * classes that decide spacing are the shipped ones. What a scenario fakes is its INPUT (a
 * roster, a message list), never the component.
 */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(HERE, '..', '..', '..');

/** The WASM client is built by wasm-pack and absent from a clean checkout; nothing here calls it. */
const WASM_STUB = '\0wasm-stub';
const stubWasmClient = () => ({
  name: 'stub-wasm-client',
  resolveId: (id) => (id.includes('citadel_internal_service_wasm_client') ? { id: WASM_STUB, moduleSideEffects: false } : undefined),
  load: (id) => (id === WASM_STUB ? 'export default {}' : undefined),
});

export async function serveHarness(port) {
  const server = await createServer({
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
    server: { port, strictPort: true, fs: { allow: [APP_ROOT] } },
  });
  await server.listen();
  return { origin: `http://localhost:${port}`, close: () => server.close() };
}
