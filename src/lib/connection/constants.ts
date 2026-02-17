/**
 * Connection Manager Constants
 *
 * Configuration constants for connection management.
 * References shared timeout-constants.ts where values overlap.
 */

import { TIMEOUT, INTERVAL } from '../timeout-constants';

/**
 * Cache TTL for active sessions (milliseconds).
 * Prevents excessive GetSessions requests.
 */
export const CACHE_TTL_MS = INTERVAL.HEARTBEAT_MS;

/**
 * Maximum number of reconnection attempts before giving up.
 */
export const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Maximum delay between reconnection attempts (milliseconds).
 */
export const MAX_RECONNECT_DELAY_MS = TIMEOUT.P2P_ACCEPT_REQUEST_MS;

/**
 * Health check timeout before reconnection attempt (milliseconds).
 */
export const HEALTH_CHECK_TIMEOUT_MS = TIMEOUT.SERVER_REQUEST_MS;

/**
 * Timeout for GetSessions request (milliseconds).
 */
export const GET_SESSIONS_TIMEOUT_MS = TIMEOUT.CLAIM_SESSION_MS;

/**
 * Timeout for WebSocket initialization during startup (milliseconds).
 */
export const WEBSOCKET_INIT_TIMEOUT_MS = TIMEOUT.SESSION_MANAGEMENT_MS;

/**
 * Timeout for setSelectedUser operation (milliseconds).
 */
export const SET_USER_TIMEOUT_MS = TIMEOUT.SESSION_MANAGEMENT_MS;

/**
 * Delay after disconnect before reconnecting (milliseconds).
 */
export const POST_DISCONNECT_DELAY_MS = TIMEOUT.P2P_MESSAGE_MS;
