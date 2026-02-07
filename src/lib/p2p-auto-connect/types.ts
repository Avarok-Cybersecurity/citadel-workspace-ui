/**
 * P2P Auto-Connect Types
 *
 * Type definitions for P2P auto-connect functionality.
 */

export interface ConnectionAttempt {
  attempts: number;
  timeout: NodeJS.Timeout | null;
}

/**
 * Information about a connected peer.
 * Stored in the nested Map structure for the single source of truth.
 */
export interface PeerConnectionInfo {
  peerCid: bigint;
  peerUsername: string;
  connectedAt: number;
  lastVerified: number;
}

/**
 * Configuration for connection retry backoff.
 */
export interface BackoffConfig {
  baseDelay: number;
  maxDelay: number;
  pollInterval: number;
}

/**
 * Default backoff configuration.
 */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelay: 1000, // 1 second
  maxDelay: 30 * 1000, // 30 seconds
  pollInterval: 30 * 1000, // 30 seconds continuous polling
};

/**
 * Online status cache configuration.
 */
export const ONLINE_STATUS_CACHE_TTL_MS = 10 * 1000; // 10 seconds

/**
 * Fresh connection threshold for race condition prevention.
 */
export const FRESH_CONNECTION_THRESHOLD_MS = 5000; // 5 seconds
