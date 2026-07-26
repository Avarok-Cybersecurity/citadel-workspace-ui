import { defineConfig } from 'vite';
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { stripWsPrefix } from "./src/lib/websocket-service/proxy-path";

/**
 * Proxy the agent's WebSocket so a locally-served app reaches it at the same same-origin `/ws`
 * path production uses.
 *
 * The app resolves its socket URL to `ws(s)://<page-host>/ws` (see
 * lib/websocket-service/resolve-url.ts). In production nginx proxies that to the agent; here Vite
 * does. Without it, local serving would need its own special-case URL - and a divergence between
 * how dev and production reach the agent is exactly how the CSP bug this replaces went unnoticed
 * for so long: dev's permissive CSP allowed `ws://localhost:12345`, production's `connect-src
 * 'self'` did not, and nothing exercised the production path.
 *
 * This is shared by BOTH `server` and `preview`. `preview` does not inherit `server.proxy`, and it
 * is the one command that serves the real production bundle - so without this, the closest thing we
 * have to a local production rehearsal would be the only place `/ws` 404s.
 *
 * AGENT_PORT lets a developer point at an agent on a non-default port without editing this file; it
 * defaults to the port the dev compose file binds.
 */
const agentProxy = {
  // `^/ws$` — an EXACT match, not a prefix. A plain '/ws' key is a prefix match in Vite, so it also
  // captures /wsfoo, /wsettings, and any future route that merely begins with those two letters,
  // forwarding them to the agent. Production does not: nginx uses `location = /ws`, which is exact,
  // and serves such paths from the SPA. Measured both ways - dev proxied /wsfoo (500) while nginx
  // returned the SPA (200) - so this was a real divergence in the one place that must not have one.
  // (Vite treats a key beginning with `^` as a RegExp.)
  '^/ws$': {
    target: `ws://localhost:${process.env.AGENT_PORT ?? '12345'}`,
    ws: true,
    // Strip `/ws`, so the agent sees `/` - byte-identical to what the production nginx sends it
    // (`proxy_pass http://<upstream>/`, whose trailing slash does the same strip). The agent
    // accepts a handshake on ANY path today, so nothing is broken without this; the point is that
    // dev and production must not differ at the agent boundary. It lives in its own module so that
    // parity is pinned by unit tests rather than asserted in a comment - see proxy-path.ts.
    rewrite: stripWsPrefix,
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
    ].filter(Boolean),

    // Prevent vite from obscuring rust errors
    clearScreen: false,

    // Use a writable cache directory (node_modules may be root-owned from Docker)
    cacheDir: '/tmp/citadel-vite-cache',

    // Handle Node.js modules
    optimizeDeps: {
      exclude: ['events', 'fs', 'path', 'crypto', 'os', 'util', 'citadel-workspace-client-ts'],
      // include: ['citadel-workspace-client-ts'],
    },

    build: {
      // After splitting all vendor dependencies, the main app chunk (~1.25MB) contains:
      // - Application code (React components, services, hooks)
      // - WASM client bindings
      // This size is reasonable for a complex workspace app with real-time collaboration
      chunkSizeWarningLimit: 1300,
      rollupOptions: {
        external: ['events', 'fs', 'path', 'crypto', 'os', 'util'],
        output: {
          // Split vendor dependencies into separate chunks for better caching
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // React DOM only (react-router may import components that use the editor, so let it fall to default)
              if (id.includes('react-dom') && !id.includes('react-router')) {
                return 'vendor-react';
              }
              // Radix UI components
              if (id.includes('@radix-ui')) {
                return 'vendor-ui';
              }
              // Rich text editor + Yjs collaboration (combined to avoid circular chunk dependencies)
              // y-prosemirror bridges yjs and prosemirror, @tiptap's collaboration uses yjs
              if (id.includes('@tiptap') || id.includes('prosemirror') ||
                id.includes('/yjs/') || id.includes('y-prosemirror') || id.includes('y-protocols')) {
                return 'vendor-collab';
              }
              // Serialization and storage
              if (id.includes('cbor-x') || id.includes('/idb/')) {
                return 'vendor-data';
              }
              // Icons
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              // Date utilities
              if (id.includes('date-fns')) {
                return 'vendor-date';
              }
              // Charts
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              // Animations
              if (id.includes('framer-motion')) {
                return 'vendor-motion';
              }
              // React Query
              if (id.includes('@tanstack')) {
                return 'vendor-query';
              }
              // Zod validation
              if (id.includes('/zod/')) {
                return 'vendor-zod';
              }
            }
          },
        },
        onwarn(warning, warn) {
          // Suppress mixed dynamic/static import warnings for modules using
          // dynamic imports to avoid circular dependencies (intentional pattern)
          if (warning.code === 'MIXED_IMPORT' ||
            (warning.message && warning.message.includes('dynamically imported by') &&
              warning.message.includes('but also statically imported'))) {
            return;
          }
          warn(warning);
        },
      },
    },

    server: {
      port: 5291,
      strictPort: true,
      // Changed from 'localhost' to '0.0.0.0' for Docker container access
      host: '0.0.0.0',
      hmr: {
        overlay: true,
        // NO hardcoded clientPort. It was pinned to 5291, which silently assumed the page is always
        // served on that port - and when it is not (`vite --port`, a second instance, a port
        // remap), the HMR socket dials 5291 while the page sits elsewhere. That is a genuinely
        // cross-origin request, so the `connect-src 'self'` below now BLOCKS it and hot reload dies
        // with a CSP error rather than a useful one. Verified in a real browser: on a mismatched
        // port Chrome refuses `ws://localhost:5291/`, and with the port inferred there are no CSP
        // violations at all. Letting Vite derive it from the page keeps the two in lockstep by
        // construction, which is the same same-origin discipline the agent socket now follows.
      },

      // Shared with `preview` below - see agentProxy.
      proxy: agentProxy,

      // File watching configuration for Docker volumes
      watch: {
        // Enable polling for Docker volume mounts
        usePolling: true,
        // Poll interval in milliseconds (fallback if env var not set)
        interval: 100,
      },

      // Allow serving files from citadel-internal-service directory
      fs: {
        allow: [
          // Search up for workspace root
          '..',
          // Allow access to workspace mount in Docker
          '/workspace',
        ]
      },

      // Custom headers for your web app.
      //
      // `connect-src` is now IDENTICAL in dev and production. It used to differ: dev additionally
      // allowed `ws://localhost:* http://localhost:*`, which is precisely why the app appeared to
      // work while the production build could not connect at all. The old code pointed the socket
      // at `ws://localhost:12345`; dev's wildcard permitted it, production's `connect-src 'self'`
      // blocked it, and nothing exercised the production path - so the breakage stayed invisible.
      //
      // The socket is now same-origin (`/ws`, proxied to the agent by Vite here and by nginx in
      // production), so `'self'` covers it in both. Keeping the two policies in lockstep means a
      // future CSP violation fails in dev, where someone will notice, rather than only in a
      // shipped artifact. `script-src` still differs by necessity: Vite's dev transform needs
      // 'unsafe-eval', production does not and must not have it.
      headers: {
        'Content-Security-Policy': mode === 'production'
          ? "default-src 'self' https://cdn.gpteng.co; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.gpteng.co; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cdn.gpteng.co https://dns.google; frame-src 'self' https://cdn.gpteng.co; img-src 'self' data: https://cdn.gpteng.co https://images.unsplash.com;"
          : "default-src 'self' https://cdn.gpteng.co; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.gpteng.co; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cdn.gpteng.co https://dns.google; frame-src 'self' https://cdn.gpteng.co; img-src 'self' data: https://cdn.gpteng.co https://images.unsplash.com;"
      },

      // Configure middleware for WASM files
      configure: (server) => {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.wasm') || req.url?.includes('citadel_internal_service_wasm_client')) {
            res.setHeader('Content-Type', 'application/wasm');
            // Prevent caching of WASM files during development
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
          next();
        });
      },
    },

    // `npm run preview` serves the real production bundle, and is therefore the closest thing to a
    // local production rehearsal. It does NOT inherit `server.proxy`, so without this the app would
    // resolve its socket to a same-origin `/ws` that the preview server does not serve - the one
    // place the production path is exercised locally would be the one place it 404s.
    preview: {
      proxy: agentProxy,
    },

    // Your existing alias configuration
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // Explicit alias for WASM client to ensure proper resolution
        // Points to root node_modules since npm workspaces hoists dependencies
        "citadel-internal-service-wasm-client": path.resolve(__dirname, "../node_modules/citadel-internal-service-wasm-client"),
      },
    },

    esbuild: {
      target: "esnext",
      // In production: strip console.log and console.debug (treat as pure/side-effect-free).
      // console.error and console.warn are preserved for runtime error visibility.
      ...(mode === 'production' ? {
        pure: ['console.log', 'console.debug', 'console.info'],
        drop: ['debugger'],
      } : {}),
    },

    // Configure WASM mime type
    assetsInclude: ['**/*.wasm'],
  };
});
