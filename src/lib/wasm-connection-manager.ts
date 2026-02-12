/**
 * WASM Connection Manager
 *
 * Maintains messenger handles across leader/follower tab transitions.
 * When a follower tab becomes leader, the in-memory WASM state (including
 * opened messenger handles) is lost. This service polls periodically to
 * ensure the messenger handles remain open.
 *
 * Features:
 * - Multi-session support: Maintains messenger handles for ALL active sessions
 * - Page Visibility API: Reduces polling when tab is hidden
 * - Circuit breaker: Stops polling after repeated failures per CID
 * - Adaptive polling: 5s when visible, 30s when hidden
 *
 * Usage:
 * - Call addSession(cid) after login or session claim
 * - Call removeSession(cid) on logout or disconnect for specific session
 * - Call stop() to stop all session management
 */

import { websocketService } from './websocket-service';
import { debugLog } from './debug-config';

const POLL_INTERVAL_VISIBLE_MS = 5000; // 5 seconds when tab is visible
const POLL_INTERVAL_HIDDEN_MS = 30000; // 30 seconds when tab is hidden
const MAX_CONSECUTIVE_FAILURES = 5; // Circuit breaker threshold

interface SessionState {
  cid: string;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
}

class WasmConnectionManager {
  private static instance: WasmConnectionManager | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  // Track multiple sessions instead of just one
  private sessions: Map<string, SessionState> = new Map();
  // Keep currentCid for backwards compatibility
  private currentCid: string | null = null;
  private boundHandleVisibilityChange: () => void;

  private constructor() {
    // Bind visibility change handler
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);

    // Listen for visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);
    }
  }

  static getInstance(): WasmConnectionManager {
    if (!WasmConnectionManager.instance) {
      WasmConnectionManager.instance = new WasmConnectionManager();
    }
    return WasmConnectionManager.instance;
  }

  /**
   * Handle tab visibility changes - adjust polling interval
   */
  private handleVisibilityChange(): void {
    if (!this.isRunning || !this.currentCid) return;

    // Restart polling with appropriate interval
    this.restartPolling();
  }

  /**
   * Get the appropriate polling interval based on tab visibility
   */
  private getPollingInterval(): number {
    if (typeof document !== 'undefined' && document.hidden) {
      return POLL_INTERVAL_HIDDEN_MS;
    }
    return POLL_INTERVAL_VISIBLE_MS;
  }

  /**
   * Restart polling with the current visibility-appropriate interval
   */
  private restartPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    if (!this.isRunning || this.sessions.size === 0) return;

    const interval = this.getPollingInterval();
    const hidden = typeof document !== 'undefined' ? document.hidden : false;
    const cids = Array.from(this.sessions.keys());
    debugLog('wasm-connection-manager', 'Starting polling for all sessions', { interval, hidden, cids });

    this.pollIntervalId = setInterval(async () => {
      // Poll for ALL active sessions, not just one
      for (const [cid, state] of this.sessions) {
        if (!state.circuitBreakerOpen) {
          await this.ensureMessengerOpenForSession(cid);
        }
      }
    }, interval);
  }

  /**
   * Start the connection manager. Called once after login or session claim.
   * Immediately ensures messenger is open, then polls periodically.
   * @param cid - The CID to maintain messenger handle for
   * @deprecated Use addSession(cid) instead for multi-session support
   */
  async start(cid: string): Promise<void> {
    // For backwards compatibility, start() now just calls addSession()
    // but also sets currentCid for backwards compatibility
    this.currentCid = cid;
    await this.addSession(cid);
  }

  /**
   * Add a session to be managed. Maintains messenger handles for ALL added sessions.
   * @param cid - The CID to add to active session management
   */
  async addSession(cid: string): Promise<void> {
    // If session already exists, just ensure messenger is open
    if (this.sessions.has(cid)) {
      debugLog('wasm-connection-manager', 'Session already tracked, ensuring messenger open', { cid });
      await this.ensureMessengerOpenForSession(cid);
      return;
    }

    // Add new session
    this.sessions.set(cid, {
      cid,
      consecutiveFailures: 0,
      circuitBreakerOpen: false
    });

    debugLog('WasmConnectionManager', `[WASM Connection Manager] Added session: ${cid} (total: ${this.sessions.size})`);
    debugLog('wasm-connection-manager', 'Added session', { cid, totalSessions: this.sessions.size });

    // Start if not already running
    if (!this.isRunning) {
      this.isRunning = true;
    }

    // Immediately ensure messenger is open for this session
    await this.ensureMessengerOpenForSession(cid);

    // Restart polling to include new session
    this.restartPolling();
  }

  /**
   * Remove a specific session from management.
   * @param cid - The CID to remove
   */
  removeSession(cid: string): void {
    if (this.sessions.has(cid)) {
      this.sessions.delete(cid);
      debugLog('WasmConnectionManager', `[WASM Connection Manager] Removed session: ${cid} (remaining: ${this.sessions.size})`);
      debugLog('wasm-connection-manager', 'Removed session', { cid, remainingSessions: this.sessions.size });

      // Clear currentCid if it was the removed session
      if (this.currentCid === cid) {
        this.currentCid = this.sessions.size > 0 ? Array.from(this.sessions.keys())[0] : null;
      }

      // If no sessions left, stop polling
      if (this.sessions.size === 0) {
        this.stop();
      } else {
        // Restart polling with remaining sessions
        this.restartPolling();
      }
    }
  }

  /**
   * Stop the connection manager. Clears all sessions.
   */
  stop(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.isRunning = false;
    this.currentCid = null;
    this.sessions.clear();
    debugLog('wasm-connection-manager', 'Stopped all sessions');
  }

  /**
   * Check if the manager is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current CID being managed
   */
  getCurrentCid(): string | null {
    return this.currentCid;
  }

  /**
   * Reset the circuit breaker for a specific session or all sessions
   */
  resetCircuitBreaker(cid?: string): void {
    if (cid) {
      const session = this.sessions.get(cid);
      if (session) {
        session.consecutiveFailures = 0;
        session.circuitBreakerOpen = false;
        debugLog('wasm-connection-manager', 'Circuit breaker reset for session', { cid });
      }
    } else {
      // Reset all sessions
      for (const session of this.sessions.values()) {
        session.consecutiveFailures = 0;
        session.circuitBreakerOpen = false;
      }
      debugLog('wasm-connection-manager', 'Circuit breaker reset for all sessions');
    }

    // Restart polling if stopped
    if (!this.isRunning && this.sessions.size > 0) {
      this.isRunning = true;
      this.restartPolling();
    }
  }

  /**
   * Get all managed session CIDs
   */
  getManagedSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Ensure messenger handle is open for the given CID.
   * Handles leader/follower transitions gracefully.
   * Implements per-session circuit breaker pattern.
   */
  private async ensureMessengerOpenForSession(cid: string): Promise<void> {
    const session = this.sessions.get(cid);
    if (!session) {
      debugLog('wasm-connection-manager', 'Session not found, skipping', { cid });
      return;
    }

    // Circuit breaker - mark session as having open circuit breaker
    if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      if (!session.circuitBreakerOpen) {
        session.circuitBreakerOpen = true;
        debugLog('wasm-connection-manager', 'Circuit breaker opened for session', {
          failures: session.consecutiveFailures,
          cid
        });
      }
      return;
    }

    try {
      const wasOpened = await websocketService.ensureMessengerOpen(BigInt(cid));
      if (wasOpened) {
        debugLog('wasm-connection-manager', 'Messenger reopened for session', { cid });
      }
      // Reset failure count on success
      session.consecutiveFailures = 0;
    } catch (error) {
      session.consecutiveFailures++;
      debugLog('wasm-connection-manager', 'Failed to ensure messenger open for session', {
        cid,
        failures: session.consecutiveFailures,
        maxFailures: MAX_CONSECUTIVE_FAILURES,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clean up resources (call on app unmount)
   */
  destroy(): void {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
    }
    WasmConnectionManager.instance = null;
  }
}

export const wasmConnectionManager = WasmConnectionManager.getInstance();
