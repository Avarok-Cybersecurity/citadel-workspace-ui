/**
 * P2P Auto-Connect Service Constants
 *
 * Timeouts, retry configuration, and polling intervals for the service.
 */
import { TIMEOUT } from '@/lib/timeout-constants';

/** Base delay for exponential backoff (1 second) */
export const BASE_DELAY_MS: number = 1000;

/** Maximum delay cap for exponential backoff (30 seconds) */
export const MAX_DELAY_MS: number = 30 * 1000;

/** Continuous polling interval after max backoff reached (30 seconds) */
export const POLL_INTERVAL_MS: number = 30 * 1000;

/** Online status cache TTL to avoid redundant API calls (10 seconds) */
export const ONLINE_STATUS_CACHE_TTL_MS: number = 10 * 1000;

/** Timeout for getCurrentCid IndexedDB reads (500ms) */
export const CID_LOOKUP_TIMEOUT_MS: number = 500;

/** Interval for waitForPeerConnected polling (500ms) */
export const PEER_CONNECTED_CHECK_INTERVAL_MS: number = 500;

/** Default timeout for waitForPeerConnected: as long as a connect may take, relayed or not. */
export const WAIT_FOR_PEER_TIMEOUT_MS: number = TIMEOUT.P2P_CONNECT_REQUEST_MS;

/** Extra time beyond timeout before cleaning up event listeners (1 second) */
export const LISTENER_CLEANUP_BUFFER_MS: number = 1000;
