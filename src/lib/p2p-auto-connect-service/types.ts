/**
 * P2P Auto-Connect Service Types
 *
 * All interfaces, type aliases, and config types for the auto-connect service.
 * Re-exports shared types from p2p-auto-connect module for convenience.
 */

// Re-export shared types from the p2p-auto-connect module (SSOT)
export type {
  ConnectionAttempt,
  PeerConnectionInfo,
  BackoffConfig,
} from '../p2p-auto-connect/types';

export {
  DEFAULT_BACKOFF_CONFIG,
  ONLINE_STATUS_CACHE_TTL_MS,
  FRESH_CONNECTION_THRESHOLD_MS,
} from '../p2p-auto-connect/types';
