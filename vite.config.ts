import { defineConfig } from 'vite';
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
    ].filter(Boolean),

    // Prevent vite from obscuring rust errors
    clearScreen: false,

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
        // Explicit client port for HMR WebSocket connection
        clientPort: 5291,
      },

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

      // Custom headers for your web app
      headers: {
        'Content-Security-Policy': "default-src 'self' https://cdn.gpteng.co; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.gpteng.co; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cdn.gpteng.co https://dns.google ws://localhost:* http://localhost:*; frame-src 'self' https://cdn.gpteng.co; img-src 'self' data: https://cdn.gpteng.co https://images.unsplash.com;"
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
