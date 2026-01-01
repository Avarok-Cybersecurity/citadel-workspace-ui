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
 */

import { eventEmitter } from './event-emitter';
import { p2pRegistrationService } from './p2p-registration-service';
import { p2pAutoConnectService } from './p2p-auto-connect-service';

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

      // For 'claim' type, ALWAYS run the startup sequence even if same CID
      // ClaimSession means user is reconnecting after TCP drop - must re-establish P2P connections
      // This is critical for ILM to deliver queued messages
      const isClaimSession = event.activationType === 'claim';
      console.log(`[ILM-TRACE] isClaimSession=${isClaimSession}, lastActivatedCid=${this.lastActivatedCid?.slice(0, 8)}, isStartingUp=${this.isStartingUp}`);

      // Prevent duplicate activations for same CID (except for ClaimSession)
      if (!isClaimSession && this.lastActivatedCid === event.cid) {
        console.log('SessionStartup: Session already activated for CID:', event.cid.slice(0, 8) + '...');
        console.log('[ILM-TRACE] BLOCKED: Duplicate CID (non-claim)');
        return;
      }

      // Prevent concurrent startup sequences - EXCEPT for 'claim' type
      // ClaimSession events are more important than regular connect events
      // because they indicate reconnection which REQUIRES P2P re-establishment
      if (this.isStartingUp) {
        if (isClaimSession) {
          // Allow 'claim' to preempt - wait for current startup to finish, then re-run
          console.log('SessionStartup: Claim event will wait for current startup, then re-run for CID:', event.cid.slice(0, 8) + '...');
          console.log('[ILM-TRACE] CLAIM WAITING: Will run after current startup completes');
          // Queue this to run after current startup finishes
          // We use a short delay to let the current startup complete
          setTimeout(() => {
            this.isStartingUp = false; // Force allow next run
            eventEmitter.emit('session:activated', event); // Re-emit to trigger startup
          }, 100);
          return;
        }
        console.log('SessionStartup: Startup already in progress, skipping for CID:', event.cid.slice(0, 8) + '...');
        console.log('[ILM-TRACE] BLOCKED: Concurrent startup in progress (non-claim)');
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
      // 0. For reconnection scenarios (ClaimSession), reset connection state
      // This is CRITICAL because:
      // - When TCP drops with orphan mode, PeerDisconnect is NOT sent to peers
      // - So peers' connectedPeers Set still has this user's CID
      // - When this user reconnects, peers skip reverse PeerConnect
      // - This causes unidirectional channels (only reconnecting user → peer works)
      //
      // By resetting state, we ensure fresh PeerConnect calls that properly
      // establish bidirectional channels.
      if (event.activationType === 'claim') {
        console.log('[ILM-TRACE] SessionStartup: Resetting connection state for ClaimSession');
        p2pAutoConnectService.resetConnectionState();
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

      // 3. Emit completion event for any listeners that need to know startup is done
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
}

// Export singleton instance - instantiation sets up event listeners
export const sessionStartupService = SessionStartupService.getInstance();
