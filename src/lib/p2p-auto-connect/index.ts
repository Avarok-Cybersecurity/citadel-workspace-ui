/**
 * P2P Auto-Connect Module
 *
 * Provides utilities for P2P auto-connection management.
 *
 * NOTE: The main P2PAutoConnectService is still at ../p2p-auto-connect-service.ts
 * These extracted modules provide reusable types and state management that can
 * be gradually adopted by the main service.
 */

// Types
export type { ConnectionAttempt, PeerConnectionInfo, BackoffConfig } from './types';
export {
  DEFAULT_BACKOFF_CONFIG,
  ONLINE_STATUS_CACHE_TTL_MS,
  FRESH_CONNECTION_THRESHOLD_MS,
} from './types';

// State Management
export { P2PConnectionState } from './state';
