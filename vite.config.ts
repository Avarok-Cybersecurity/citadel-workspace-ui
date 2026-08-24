import { defineConfig } from 'vite';
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from 'vite-plugin-pwa';
import path from "path";
import { stripWsPrefix } from "./src/lib/websocket-service/proxy-path";

/**
 * The Content-Security-Policy the app ships under.
 *
 * PRODUCTION_CSP is byte-identical to the policy nginx sends in
 * docker/ui/nginx.conf.template. That is the whole point: `npm run preview` is the only
 * command that serves the real production bundle, so it is the only local place a CSP
 * violation can surface before deploy. It previously allowed `'unsafe-inline'` in
 * script-src plus https://cdn.gpteng.co and https://images.unsplash.com - none of which
 * nginx allows - which made preview STRICTLY MORE PERMISSIVE than production and unable
 * to catch the very class of bug it exists to catch. The gpteng/unsplash origins were
 * scaffold residue: nothing in the app loads from either.
 *
 * `connect-src 'self'` is the load-bearing part: the agent socket is same-origin (`/ws`),
 * so 'self' covers it and no `ws:`/`wss:` wildcard is needed. A bare scheme source would
 * match ANY host, which would let an XSS payload exfiltrate to an attacker's socket.
 */
const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

/**
 * Identical to production except for the two script-src sources Vite's dev transform
 * genuinely requires: 'unsafe-eval' and 'unsafe-inline' (the HMR client and the
 * react-refresh preamble are injected inline). Production has neither and must not.
 * Every other directive - and `connect-src` in particular - is deliberately the SAME,
 * so a violation fails in dev, where someone will notice.
 */
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

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
    // 127.0.0.1, NOT localhost. `localhost` resolves to ::1 before 127.0.0.1 on macOS
    // (and Node 17+ stopped reordering DNS results to prefer IPv4), while the agent
    // binds IPv4 only — so the proxy dialled ::1, got ECONNREFUSED, and every dev
    // WebSocket died with a bare "socket hang up". The app itself, test.config.json
    // and the compose healthchecks all already use 127.0.0.1; this was the one place
    // that did not.
    target: `ws://127.0.0.1:${process.env.AGENT_PORT ?? '12345'}`,
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
      /**
       * Installable PWA + offline app shell.
       *
       * `registerType: 'prompt'` rather than 'autoUpdate': this app holds live
       * WebSocket and P2P state, and swapping the running bundle underneath an
       * open session would drop it. The user is asked instead (see PwaUpdatePrompt).
       *
       * The WASM client is deliberately NOT precached. At ~2.3 MB it would dominate
       * the install payload, and it is fetched on demand by the client anyway; it is
       * served from the runtime cache below so a repeat visit still gets it instantly.
       */
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Citadel Workspace',
          short_name: 'Citadel',
          description: 'Post-quantum secure, peer-to-peer collaborative workspace.',
          id: '/',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#1C1D28',
          theme_color: '#6E59A5',
          categories: ['productivity', 'business', 'security'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Jump straight to the two places people actually open the app for,
          // from the installed icon's context menu (right-click on desktop,
          // long-press on Android). An installed app that can only ever open on
          // its home screen makes installation worth less than a bookmark.
          //
          // Both are real routes in App.tsx, not aspirational ones: a shortcut
          // to a route that does not exist lands the user on the 404 page from
          // their own dock, which is worse than having no shortcut.
          shortcuts: [
            {
              name: 'Messages',
              short_name: 'Messages',
              description: 'Open your direct conversations',
              url: '/messages',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Workspace',
              short_name: 'Workspace',
              description: 'Open the workspace and its rooms',
              url: '/workspace',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          // Precache the shell. Excluding the WASM binary keeps the install small;
          // 4 MiB still comfortably covers the JS/CSS chunks.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: ['**/*.wasm'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // SPA fallback, minus the endpoints that must always hit the network.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/ws$/, /^\/api/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Large, content-hashed, and immutable once built.
              urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'citadel-wasm',
                expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          // Off by default: a service worker intercepting requests during
          // development makes HMR behaviour confusing to reason about.
          enabled: false,
          type: 'module',
        },
      }),
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
            // Keep each of these service directories whole. Their barrel (index.ts)
            // re-exports a module that transitively depends on the barrel again, so
            // if the two land in different route chunks Rollup emits a circular-chunk
            // warning and, in its own words, "will likely lead to broken execution
            // order". Co-locating them removes the cycle at the chunk level and also
            // caches better: these services change far less often than the pages that
            // use them.
            if (/[\\/]src[\\/]lib[\\/](p2p|connection-service|peer-registration-store)[\\/]/.test(id)) {
              return 'app-services';
            }

            if (id.includes('node_modules')) {
              // The whole React runtime in ONE chunk. Splitting react-dom out while
              // leaving `react` itself in the entry chunk produced a genuine cycle
              // (vendor-react -> vendor-collab -> vendor-react), because the editor
              // vendor chunk imports React. Rollup warns that such a cycle "will
              // likely lead to broken execution order", so this is a correctness fix
              // rather than a size one.
              if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
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
        'Content-Security-Policy': mode === 'production' ? PRODUCTION_CSP : DEV_CSP
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
    // local production rehearsal. It inherits NOTHING from `server` - not the proxy, not the
    // headers - so both are restated here.
    //
    // The headers matter as much as the proxy. Without them preview serves no CSP at all, so the
    // one command that exercises the production bundle would be the one place a CSP violation
    // CANNOT surface - which is exactly the blind spot that let the original bug ship. Production
    // gets this policy from nginx; preview stands in for nginx, so it has to send it too.
    preview: {
      proxy: agentProxy,
      headers: { 'Content-Security-Policy': PRODUCTION_CSP },
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
