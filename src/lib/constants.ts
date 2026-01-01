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
