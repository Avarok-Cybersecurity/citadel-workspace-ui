/**
 * Minimal debug utilities for logging.
 * Simplified from the original - just wraps console methods.
 */

/**
 * Log debug messages. Always logs to console.
 */
export function debugLog(category: string, ...args: unknown[]): void {
  console.log(`[${category}]`, ...args);
}

/**
 * Log error messages. Always logs to console.
 */
export function errorLog(category: string, ...args: unknown[]): void {
  console.error(`[${category}]`, ...args);
}
