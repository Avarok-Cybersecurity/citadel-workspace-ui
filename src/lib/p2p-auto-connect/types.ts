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
// The VALUES live in p2p-auto-connect-service/constants.ts, which is what the
// consumers actually import. They were declared in both places, and the copy
// carrying the "(SSOT)" label in the re-export next door was the one nobody
// read — so tuning it changed nothing. Derived here so the two cannot part.
import {
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  POLL_INTERVAL_MS,
  ONLINE_STATUS_CACHE_TTL_MS as SERVICE_ONLINE_STATUS_CACHE_TTL_MS,
} from '../p2p-auto-connect-service/constants';

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelay: BASE_DELAY_MS,
  maxDelay: MAX_DELAY_MS,
  pollInterval: POLL_INTERVAL_MS,
};

export const ONLINE_STATUS_CACHE_TTL_MS: number = SERVICE_ONLINE_STATUS_CACHE_TTL_MS;

/** Fresh connection threshold for race condition prevention. */
export const FRESH_CONNECTION_THRESHOLD_MS = 5000;
