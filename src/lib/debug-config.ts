/**
 * Debug utilities for logging — gated by environment.
 *
 * In development (import.meta.env.DEV): all log levels emit to console.
 * In production: only error and warn emit; debug/info are no-ops.
 */

const isDev: boolean = import.meta.env.DEV;

/** No-op function for suppressed log levels in production. */
const noop = (..._args: unknown[]): void => { /* intentionally empty */ };

/**
 * Log debug messages. Only emits in development.
 */
/**
 * Render a value the console can show.
 *
 * A bare `bigint` argument is printed as `undefined` by Playwright's
 * `consoleMessage.text()` -- measured directly:
 *
 *   console.log('x:', 123n)              ->  "x: undefined"
 *   console.log('x:', { cid: 789n })     ->  "x: {cid: 789n}"
 *
 * Every CID in this app is a bigint, so every log line whose whole purpose was
 * to name one has been reporting `undefined` in every captured run. It is worse
 * than no log line, because it gets believed: "Disconnecting session:
 * undefined" is what an open lead about the wire omitting `cid` was founded on,
 * and the wire had never omitted it.
 *
 * Converted here rather than at eighty call sites, so a line written tomorrow
 * is readable without anybody remembering this.
 */
function printable(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`;
  return value;
}

export const debugLog: (category: string, ...args: unknown[]) => void = isDev
  ? (category, ...args): void => console.log(`[${category}]`, ...args.map(printable))
  : noop;

/**
 * Log error messages. Always emits (errors should always be visible).
 */
export function errorLog(category: string, ...args: unknown[]): void {
  console.error(`[${category}]`, ...args.map(printable));
}

/**
 * Log warning messages. Always emits (warnings should always be visible).
 */
export function warnLog(category: string, ...args: unknown[]): void {
  console.warn(`[${category}]`, ...args.map(printable));
}

/**
 * Whether diagnostic UI (internal state that is meaningless to an end user)
 * should be rendered.
 *
 * The multi-tab Leader/Follower badge is the motivating case: it exposes which
 * browser tab owns the WebSocket, which matters when debugging tab coordination
 * and is confusing noise otherwise — a user has no action to take on being told
 * they are a "Follower".
 *
 * Enabled in development, and in any build via an explicit opt-in, so a
 * production issue can still be inspected without a rebuild:
 *   - `?diagnostics=1` in the URL, or
 *   - `localStorage.setItem('citadel:diagnostics', 'true')`
 *
 * Stated explicitly rather than defaulted: hiding internals from end users while
 * keeping them reachable for support is a product decision, not an incidental one.
 */
export function isDiagnosticsUiEnabled(): boolean {
  if (isDev) return true;
  if (typeof window === 'undefined') return false;

  try {
    if (new URLSearchParams(window.location.search).get('diagnostics') === '1') return true;
    return window.localStorage.getItem('citadel:diagnostics') === 'true';
  } catch {
    // Storage can throw in a sandboxed/partitioned context; absence of the
    // opt-in simply means diagnostics stay hidden.
    return false;
  }
}
