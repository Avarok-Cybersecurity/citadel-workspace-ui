/**
 * Centralized constants for the Citadel Workspaces application.
 * All timing intervals, polling periods, and configuration values should be defined here.
 */

/**
 * P2P-related constants for peer connection management.
 */
export const P2P_CONSTANTS = {
  /**
   * Interval for polling GetSessions to refresh peer connection state (in milliseconds).
   * This provides eventual consistency for the connectedPeers map.
   * Events (PeerConnectSuccess, PeerDisconnect) provide instant updates.
   *
   * Note: Set to 5 seconds to avoid excessive backend polling and UI freezes.
   * The event-based updates handle the common case; polling is just a fallback.
   */
  GET_SESSIONS_POLL_INTERVAL_MS: 5000,
} as const;

/**
 * Retry and backoff timing constants.
 */
export const RETRY_CONSTANTS = {
  /** Base delay for exponential backoff (1 second) */
  BASE_DELAY_MS: 1000,
  /** Maximum delay for exponential backoff (30 seconds) */
  MAX_DELAY_MS: 30000,
  /** Maximum delay for server reconnection (5 minutes) */
  SERVER_RECONNECT_MAX_DELAY_MS: 300000,
} as const;

/**
 * Request timeout constants.
 */
export const TIMEOUT_CONSTANTS = {
  /** Timeout for GetSessions requests */
  GET_SESSIONS_MS: 10000,
  /** Timeout for workspace requests */
  WORKSPACE_REQUEST_MS: 30000,
  /** Timeout for file transfer requests */
  FILE_TRANSFER_MS: 60000,
  /** Default request timeout */
  DEFAULT_REQUEST_MS: 10000,
  /** WebSocket initialization timeout */
  WEBSOCKET_INIT_MS: 3000,
  /** Leader election timeout */
  LEADER_ELECTION_MS: 3000,
} as const;

/**
 * Polling interval constants.
 */
export const POLL_CONSTANTS = {
  /** Tab visible polling interval (5 seconds) */
  TAB_VISIBLE_MS: 5000,
  /** Tab hidden polling interval (30 seconds) */
  TAB_HIDDEN_MS: 30000,
  /** Background reconnection polling (1 minute) */
  BACKGROUND_RECONNECT_MS: 60000,
  /** Outgoing registration poll interval (5 minutes) */
  OUTGOING_REGISTRATION_MS: 300000,
  /** Typing indicator poll interval (500ms) */
  TYPING_INDICATOR_MS: 500,
} as const;

/**
 * Cache TTL constants.
 */
export const CACHE_CONSTANTS = {
  /** Online status cache TTL (2 seconds) */
  ONLINE_STATUS_TTL_MS: 2000,
  /** Session info cache TTL (10 seconds) */
  SESSION_CACHE_TTL_MS: 10000,
} as const;
