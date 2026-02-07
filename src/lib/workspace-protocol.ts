/**
 * workspace-protocol.ts
 *
 * Utility functions for protocol messages in the Citadel Workspace application.
 */

/**
 * Generates a unique request ID for tracking messages
 * @returns A unique request ID string
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
