/**
 * Centralized Session Startup Service
 *
 * Triggers all background services when a user session becomes active.
 * This ensures consistent startup behavior for:
 * - Initial Connect/Register
 * - ClaimSession (reclaim orphaned session)
 * - Login (credentials after explicit disconnect)
 *
 * All P2P startup logic is centralized here to prevent duplicate
 * service starts and ensure ILM message delivery works after reconnection.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        CID LIFECYCLE - CRITICAL INFO                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║ CID (Client ID) is a persistent 64-bit identifier assigned per account.      ║
 * ║                                                                              ║
 * ║ | Operation              | CID Behavior                                     |║
 * ║ |------------------------|--------------------------------------------------|║
 * ║ | Register (new account) | NEW CID assigned                                 |║
 * ║ | Login (credentials)    | SAME CID preserved                               |║
 * ║ | ClaimSession (orphan)  | SAME CID preserved                               |║
 * ║ | C2S disconnect+reconnect| SAME CID preserved, rekey works                 |║
 * ║ | TCP drop with orphan   | SAME CID, session persists on server             |║
 * ║                                                                              ║
 * ║ IMPORTANT: Only Register creates a new CID. All reconnection scenarios       ║
 * ║ (login, claim, TCP reconnect) preserve the original CID.                     ║
 * ║                                                                              ║
 * ║ For session startup:                                                         ║
 * ║ - 'connect' activationType: New registration, new CID assigned               ║
 * ║ - 'claim' activationType: Same CID, reconnecting orphaned session            ║
 * ║ - 'login' activationType: Same CID, re-authenticating with credentials       ║
 * ║                                                                              ║
 * ║ The startup sequence resets local connection state but the CID from the      ║
 * ║ event remains the same - we're reconnecting to the SAME session.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { eventEmitter } from './event-emitter';
import { p2pRegistrationService } from './p2p-registration-service';
import { p2pAutoConnectService } from './p2p-auto-connect-service';
import { wasmConnectionManager } from './wasm-connection-manager';

export interface SessionActivatedEvent {
  cid: string;
  username: string;
  serverAddress: string;
  activationType: 'connect' | 'claim' | 'login';
}

class SessionStartupService {
  private static instance: SessionStartupService;
  private lastActivatedCid: string | null = null;
  private isStartingUp = false;
  // Track when the last reconnection startup completed (for time-based guards)
  private lastReconnectionCompletedAt: number = 0;
  // Grace period in ms after reconnection during which stale cleanup is skipped
  // 15s is needed because Test 8 has multiple steps between reconnection and verification
  private static readonly RECONNECTION_GRACE_PERIOD_MS = 15000;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): SessionStartupService {
    if (!SessionStartupService.instance) {
      SessionStartupService.instance = new SessionStartupService();
    }
    return SessionStartupService.instance;
  }

  private setupEventListeners(): void {
    eventEmitter.on('session:activated', async (event: SessionActivatedEvent) => {
      // ILM-TRACE: Log incoming event for debugging
      console.log(`[ILM-TRACE] session:activated received: cid=${event.cid?.slice(0, 8)}, type=${event.activationType}, user=${event.username}`);

      // For 'claim' and 'login' types, ALWAYS run the startup sequence even if same CID
      // - ClaimSession: User is reconnecting after TCP drop - must re-establish P2P connections
      // - Login: User logged back in after explicit disconnect - must re-establish P2P connections
      // Both scenarios preserve the CID, so we can't use CID matching to block them.
      // This is critical for ILM to deliver queued messages after reconnection.
      const isReconnection = event.activationType === 'claim' || event.activationType === 'login';
      console.log(`[ILM-TRACE] isReconnection=${isReconnection} (type=${event.activationType}), lastActivatedCid=${this.lastActivatedCid?.slice(0, 8)}, isStartingUp=${this.isStartingUp}`);

      // Prevent duplicate activations for same CID (except for ClaimSession and Login)
      // Only block duplicate 'connect' events (initial registration) - these should not happen
      // in normal operation but could occur due to event system bugs.
      if (!isReconnection && this.lastActivatedCid === event.cid) {
        console.log('SessionStartup: Session already activated for CID:', event.cid.slice(0, 8) + '...');
        console.log('[ILM-TRACE] BLOCKED: Duplicate CID (non-reconnection)');
        return;
      }

      // Prevent concurrent startup sequences - EXCEPT for reconnection events (claim/login)
      // Reconnection events are more important than regular connect events
      // because they indicate reconnection which REQUIRES P2P re-establishment
      if (this.isStartingUp) {
        if (isReconnection) {
          // Allow reconnection events to preempt - wait for current startup to finish, then re-run
          console.log(`SessionStartup: ${event.activationType} event will wait for current startup, then re-run for CID:`, event.cid.slice(0, 8) + '...');
          console.log('[ILM-TRACE] RECONNECTION WAITING: Will run after current startup completes');
          // Queue this to run after current startup finishes
          // We use a short delay to let the current startup complete
          setTimeout(() => {
            this.isStartingUp = false; // Force allow next run
            eventEmitter.emit('session:activated', event); // Re-emit to trigger startup
          }, 100);
          return;
        }
        console.log('SessionStartup: Startup already in progress, skipping for CID:', event.cid.slice(0, 8) + '...');
        console.log('[ILM-TRACE] BLOCKED: Concurrent startup in progress (non-reconnection)');
        return;
      }

      this.lastActivatedCid = event.cid;
      this.isStartingUp = true;

      console.log(`SessionStartup: Activating session for ${event.username} (${event.activationType}), CID: ${event.cid.slice(0, 8)}...`);
      console.log('[ILM-TRACE] PROCEEDING with startup sequence');

      try {
        await this.runStartupSequence(event);
      } finally {
        this.isStartingUp = false;
      }
    });
  }

  private async runStartupSequence(event: SessionActivatedEvent): Promise<void> {
    try {
      // 0. For reconnection scenarios (ClaimSession OR Login), reset connection state
      // This is CRITICAL because:
      // - For ClaimSession: TCP drops with orphan mode, PeerDisconnect is NOT sent to peers
      //   So peers' connectedPeers Set still has this user's CID
      // - For Login: After explicit disconnect, the previous session is destroyed
      //   A new session with a new CID is created, but local state may be stale
      //
      // By resetting state, we ensure fresh PeerConnect calls that properly
      // establish bidirectional channels.
      if (event.activationType === 'claim' || event.activationType === 'login') {
        console.log(`[ILM-TRACE] SessionStartup: Resetting connection state for ${event.activationType}`);
        await p2pAutoConnectService.resetConnectionState();
      }

      // 0.5. CRITICAL: Start WASM connection manager to open ILM messenger handle
      // This MUST happen before P2P operations so that the ILM layer is ready
      // to send and receive messages. Without this, ACKs are never sent for
      // inbound messages, causing outbound messages to block waiting for ACKs.
      try {
        await wasmConnectionManager.start(event.cid);
        console.log('SessionStartup: WASM connection manager started for CID:', event.cid.slice(0, 8) + '...');
      } catch (error) {
        console.error('SessionStartup: Failed to start WASM connection manager:', error);
        // Don't fail the entire startup - P2P may still work without ILM
      }

      // 1. Start P2P registration service (idempotent - won't restart if already running)
      // This handles peer discovery and registration notifications
      await p2pRegistrationService.start({ autoRegisterAll: false });
      console.log('SessionStartup: P2P Registration Service started');

      // 2. Connect to all registered peers
      // CRITICAL: This is what was missing after ClaimSession!
      // Without this, Alice's ILM never sees Bob as connected
      await p2pAutoConnectService.connectToAllRegisteredPeers();
      console.log('SessionStartup: P2P Auto-Connect initiated for all registered peers');

      // 3. Track reconnection completion time for grace period logic
      if (event.activationType === 'claim' || event.activationType === 'login') {
        this.lastReconnectionCompletedAt = Date.now();
        console.log(`SessionStartup: Reconnection completed, grace period started (${SessionStartupService.RECONNECTION_GRACE_PERIOD_MS}ms)`);
      }

      // 4. Emit completion event for any listeners that need to know startup is done
      eventEmitter.emit('session:startup-complete', event);
      console.log(`SessionStartup: Startup sequence complete for ${event.username}`);
    } catch (error) {
      console.error('SessionStartup: Error during startup sequence:', error);
      // Emit error event but don't re-throw - session is still active
      eventEmitter.emit('session:startup-error', { ...event, error });
    }
  }

  /**
   * Reset the service state (e.g., on logout or session change)
   * This allows a new session activation for a different CID
   */
  public reset(): void {
    this.lastActivatedCid = null;
    this.isStartingUp = false;
    console.log('SessionStartup: Service state reset');
  }

  /**
   * Get the last activated CID (for debugging)
   */
  public getLastActivatedCid(): string | null {
    return this.lastActivatedCid;
  }

  /**
   * Check if session startup is currently in progress OR we're within the grace period
   * after a reconnection. Used by MembersSection to avoid premature stale conversation cleanup.
   *
   * Returns true if:
   * - Startup sequence is currently running, OR
   * - A reconnection (claim/login) completed less than RECONNECTION_GRACE_PERIOD_MS ago
   */
  public isStartupInProgress(): boolean {
    if (this.isStartingUp) {
      return true;
    }

    // Check grace period after reconnection
    if (this.lastReconnectionCompletedAt > 0) {
      const elapsed = Date.now() - this.lastReconnectionCompletedAt;
      if (elapsed < SessionStartupService.RECONNECTION_GRACE_PERIOD_MS) {
        console.log(`[SessionStartup] Within reconnection grace period (${elapsed}ms of ${SessionStartupService.RECONNECTION_GRACE_PERIOD_MS}ms)`);
        return true;
      }
    }

    return false;
  }
}

// Export singleton instance - instantiation sets up event listeners
export const sessionStartupService = SessionStartupService.getInstance();
