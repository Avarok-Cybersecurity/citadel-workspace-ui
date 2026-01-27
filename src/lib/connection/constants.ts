/**
 * Connection Manager Constants
 *
 * Configuration constants for connection management.
 */

/**
 * Cache TTL for active sessions (milliseconds).
 * Prevents excessive GetSessions requests.
 */
export const CACHE_TTL_MS = 2000;

/**
 * Maximum number of reconnection attempts before giving up.
 */
export const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Maximum delay between reconnection attempts (milliseconds).
 */
export const MAX_RECONNECT_DELAY_MS = 10000;

/**
 * Health check timeout before reconnection attempt (milliseconds).
 */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Timeout for GetSessions request (milliseconds).
 */
export const GET_SESSIONS_TIMEOUT_MS = 10000;

/**
 * Timeout for WebSocket initialization during startup (milliseconds).
 */
export const WEBSOCKET_INIT_TIMEOUT_MS = 3000;

/**
 * Timeout for setSelectedUser operation (milliseconds).
 */
export const SET_USER_TIMEOUT_MS = 3000;

/**
 * Delay after disconnect before reconnecting (milliseconds).
 */
export const POST_DISCONNECT_DELAY_MS = 500;
