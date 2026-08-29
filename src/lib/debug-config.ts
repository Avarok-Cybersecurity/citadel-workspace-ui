/**
 * Debug utilities for logging — gated by environment.
 *
 * In development (import.meta.env.DEV): all log levels emit to console.
 * In production: only error and warn emit; debug/info are no-ops.
 */

const isDev = import.meta.env.DEV;

/** No-op function for suppressed log levels in production. */
const noop = (..._args: unknown[]): void => { /* intentionally empty */ };

/**
 * Log debug messages. Only emits in development.
 */
export const debugLog: (category: string, ...args: unknown[]) => void = isDev
  ? (category, ...args): void => console.log(`[${category}]`, ...args)
  : noop;

/**
 * Log error messages. Always emits (errors should always be visible).
 */
export function errorLog(category: string, ...args: unknown[]): void {
  console.error(`[${category}]`, ...args);
}

/**
 * Log warning messages. Always emits (warnings should always be visible).
 */
export function warnLog(category: string, ...args: unknown[]): void {
  console.warn(`[${category}]`, ...args);
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
