/**
 * Resolve the WebSocket URL used to reach the local Citadel agent.
 *
 * The agent (citadel-internal-service) is a NATIVE process - it holds the ratchet keys, does the
 * crypto, and speaks the Citadel protocol over TCP/QUIC, none of which a browser can do. So the
 * browser always talks to it over a WebSocket, and this is the single place that decides where.
 *
 * The default is a SAME-ORIGIN `/ws` path, derived from the page's own location. That matters for
 * two reasons:
 *
 *  1. The production Content-Security-Policy is `connect-src 'self'`. A WebSocket to
 *     `ws://localhost:12345` from a page served on :8080 is a DIFFERENT origin, so the browser
 *     blocks it outright. Serving the socket from the same origin (behind an nginx `/ws` proxy)
 *     is what lets the strict CSP stay strict.
 *  2. Baking an absolute URL in at build time (the old `VITE_WS_URL`-or-localhost behaviour)
 *     produces one image per environment, which cannot be distributed from a registry. Deriving
 *     it at runtime means a single image works locally, behind a tunnel, or in a desktop shell.
 *
 * Kept as a pure function - it takes the location rather than reaching for `window` - so the
 * precedence rules can be tested without a DOM.
 */
export interface UrlLocation {
  /** e.g. `https:` or `http:` */
  protocol: string;
  /** host WITH port, e.g. `localhost:8080` */
  host: string;
}

export function resolveWebsocketUrl(
  /** Programmatic override. Highest precedence; used by tests and embedders. */
  configuredUrl: string | undefined,
  /** Build-time override (`VITE_WS_URL`). Retained so existing hosted deployments that bake an
   *  absolute `wss://host/ws` keep working unchanged. */
  buildTimeUrl: string | undefined,
  location: UrlLocation,
): string {
  if (configuredUrl) return configuredUrl;
  if (buildTimeUrl) return buildTimeUrl;

  // Follow the page's scheme: a page served over TLS must not open an insecure socket (browsers
  // block the mixed content), and a plain-http page cannot complete a `wss` handshake.
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
