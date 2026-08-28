/**
 * Centralized timeout and interval constants.
 * Extracted from magic numbers scattered across the codebase.
 */

export const TIMEOUT = {
  /** Default timeout for server requests (WebSocket round-trip) */
  SERVER_REQUEST_MS: 5000,
  /** Timeout for disconnect requests (may involve cleanup) */
  DISCONNECT_REQUEST_MS: 30000,
  /** Timeout for file picker dialog */
  FILE_PICKER_MS: 120000,
  /** Timeout for LocalDB (IndexedDB) operations */
  LOCALDB_REQUEST_MS: 5000,
  /** Timeout for getSelectedUser() tab context lookup */
  GET_SELECTED_USER_MS: 2000,
  /** Timeout for P2P connection establishment */
  P2P_CONNECT_REQUEST_MS: 30000,
  /** Timeout for P2P accept request */
  P2P_ACCEPT_REQUEST_MS: 10000,
  /** Timeout for P2P disconnect */
  P2P_DISCONNECT_MS: 10000,
  /** Timeout for P2P message send acknowledgment */
  P2P_MESSAGE_MS: 500,
  /** Debounce timeout for search input */
  SEARCH_DEBOUNCE_MS: 300,
  /** Timeout for session management operations (SetOrphanMode) */
  SESSION_MANAGEMENT_MS: 3000,
  /** Timeout for ClaimSession / DisconnectOrphan */
  CLAIM_SESSION_MS: 10000,
  /** Timeout for peer registration operations */
  PEER_REGISTER_MS: 10000,
  /** Timeout for permission fetch operations */
  PERMISSION_FETCH_MS: 10000,
  /**
   * Timeout for peer list operations.
   *
   * Must exceed the agent's own PEER_LIST_TIMEOUT, which is 30s
   * (citadel-internal-service .../requests/peer/mod.rs). It was 6000, chosen
   * against a 5s wrapper that no longer exists — so under load the browser
   * declared discovery failed while the service was still legitimately working,
   * and the late answer arrived with no listener.
   *
   * Longer than the thing it waits on, not shorter: giving up first turns a
   * slow answer into a wrong one.
   */
  PEER_LIST_MS: 35000,
  /** Timeout for file send requests */
  FILE_SEND_MS: 30000,
  /** Timeout for file download requests */
  FILE_DOWNLOAD_MS: 60000,
  /** Timeout for outbound ACK from leader */
  OUTBOUND_ACK_MS: 30000,
  /** Timeout for CheckState (peer readiness check) */
  CHECKSTATE_MS: 3000,

  /**
   * How long to wait for a waiting service worker to take control after being
   * sent SKIP_WAITING, before reloading anyway. Short on purpose: the user has
   * pressed a recovery button on a crashed screen, so a reload that misses the
   * update beats a button that appears to hang.
   */
  SW_ACTIVATION_MS: 3000,
} as const;

export const INTERVAL = {
  /** Health check polling interval */
  HEALTH_CHECK_MS: 30000,
  /** WebSocket heartbeat/keep-alive interval */
  HEARTBEAT_MS: 2000,
  /** Leader election broadcast interval */
  LEADER_ELECTION_MS: 3000,
  /** Leader heartbeat timeout (declare leader dead) */
  LEADER_TIMEOUT_MS: 5000,
  /** Periodic cleanup interval (stale requests, etc.) */
  CLEANUP_MS: 60000,
  /** Request tracking expiry interval */
  REQUEST_TRACKING_MS: 300000,
  /** Permission cache TTL */
  PERMISSION_CACHE_MS: 60000,
} as const;

export const POLLING = {
  /** P2P registration polling interval */
  P2P_REGISTRATION_INTERVAL_MS: 30000,
  /** Server auto-reconnect polling interval */
  SERVER_POLL_INTERVAL_MS: 60000,
  /** Outgoing request check interval */
  OUTGOING_REQUESTS_INTERVAL_MS: 300000,
  /** GetSessions polling interval for peer connection state sync (fallback consistency) */
  GET_SESSIONS_POLL_INTERVAL_MS: 5000,
} as const;

export const NETWORK = {
  // INTERNAL_SERVICE_PORT was removed: its only consumer was the old
  // `ws://localhost:${INTERNAL_SERVICE_PORT}` default, which is gone now that the socket URL is
  // derived from the page (see websocket-service/resolve-url.ts). Leaving it would invite someone
  // to rebuild that off-origin URL, which the production CSP blocks. The agent's address is a
  // deployment concern now - nginx's AGENT_UPSTREAM - not a frontend constant.
  /** Workspace server port (citadel-workspace-server-kernel) */
  WORKSPACE_SERVER_PORT: 12349,
} as const;
