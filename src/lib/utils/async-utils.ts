/**
 * Standard wrapper for fire-and-forget async operations.
 * Replaces the `(async () => { ... })().catch(console.error)` pattern
 * with a named, greppable function call.
 */
export function runAsyncSetup(fn: () => Promise<void>): void {
  fn().catch(console.error);
}
