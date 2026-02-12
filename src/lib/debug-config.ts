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
  ? (category, ...args) => console.log(`[${category}]`, ...args)
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
