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
 * precedence rules can be tested without a DOM, and so nothing here explodes if the module is
 * loaded outside a browser (SSR, a plain-node test runner).
 */
export interface UrlLocation {
  /** e.g. `https:` or `http:` */
  protocol: string;
  /** host WITH port, e.g. `localhost:8080` */
  host: string;
}

/**
 * Thrown when the URL has to be derived from the page but there is no page - i.e. the service was
 * constructed outside a browser and no explicit URL was given. Failing loudly beats inventing a
 * plausible `localhost` default, which would surface much later as an opaque connection failure.
 */
export class MissingWebsocketLocationError extends Error {
  constructor() {
    super(
      'Cannot resolve the agent WebSocket URL: nothing was configured explicitly and there is no ' +
        'page location to derive one from (not running in a browser). Pass `websocketUrl` when ' +
        'constructing the service outside a browser.',
    );
    this.name = 'MissingWebsocketLocationError';
  }
}

/** The HTTP origin a websocket URL shares with a page: `wss://h` and `https://h` are same-origin. */
function websocketOrigin(url: URL): string {
  const protocol =
    url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  return `${protocol}//${url.host}`;
}

/**
 * An off-origin override cannot work in a browser: `connect-src 'self'` blocks it, and the failure
 * arrives as an opaque connection error that says nothing about CSP. We still honour the value -
 * an embedder outside a browser (a desktop shell) has no CSP and is entitled to it - but we say so
 * loudly, because the alternative is a silent dead end that looks like a broken agent.
 */
function warnIfOffOrigin(candidate: string, location: UrlLocation | undefined): void {
  if (!location) return;

  const pageOrigin = `${location.protocol}//${location.host}`;

  // Resolve against the page, exactly as the browser will. Parsing without a base and treating
  // every failure as "relative, therefore same-origin" would wave through a PROTOCOL-RELATIVE
  // override: `//elsewhere.example/ws` has no parseable scheme on its own, but the browser
  // resolves it against the page's scheme to a genuinely off-origin URL - which CSP then blocks,
  // silently, with the warning suppressed. Resolving here means only truly same-origin values
  // (`/ws`) come out same-origin.
  let parsed: URL;
  try {
    parsed = new URL(candidate, pageOrigin);
  } catch {
    return; // Unparseable even with a base; nothing useful to say about it.
  }

  if (websocketOrigin(parsed) === pageOrigin) return;

  console.warn(
    `[websocket] Configured agent URL "${candidate}" is not same-origin with the page ` +
      `(${pageOrigin}). The Content-Security-Policy is \`connect-src 'self'\`, so the browser will ` +
      `BLOCK this connection. Reach the agent through the same-origin /ws proxy instead.`,
  );
}

export function resolveWebsocketUrl(
  /** Programmatic override. Highest precedence; used by tests and embedders. */
  configuredUrl: string | undefined,
  /** Build-time override (`VITE_WS_URL`). Retained so an existing hosted deployment that bakes a
   *  same-origin `wss://host/ws` keeps working unchanged. Off-origin values are blocked by CSP. */
  buildTimeUrl: string | undefined,
  /** The page's location; `undefined` outside a browser, where an override is then required. */
  location: UrlLocation | undefined,
): string {
  const override = configuredUrl || buildTimeUrl;
  if (override) {
    warnIfOffOrigin(override, location);
    return override;
  }

  if (!location) throw new MissingWebsocketLocationError();

  // Follow the page's scheme: a page served over TLS must not open an insecure socket (browsers
  // block the mixed content), and a plain-http page cannot complete a `wss` handshake.
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
