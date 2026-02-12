/**
 * CheckState Manager
 *
 * Handles the CheckState/CheckStateResponse handshake protocol.
 * This is an optional optimization - the ILM (Intersession Layer Manager)
 * handles message reliability, so CheckState is primarily for confirming
 * peer readiness before sending the first message.
 */

import {
  createMessagingLayerCommand,
  serializeP2PCommand,
} from '@/types/p2p-types';
import {
  createCheckState,
  createCheckStateResponse,
} from '@/types/messaging-layer';
import { debugLog } from '@/lib/debug-config';

export interface CheckStateConfig {
  /** Timeout for CheckState response (ms) */
  timeout: number;
  /** Function to send serialized bytes to peer */
  sendToP2P: (peerCid: bigint, bytes: Uint8Array) => Promise<void>;
  /** Function to get current CID */
  getCurrentCid: () => Promise<bigint | null>;
  /** Function to get conversation's last message index */
  getLastMessageIndex: (peerCid: bigint) => number;
}

export class CheckStateManager {
  // Peer ready state tracking for CheckState/CheckStateResponse handshake
  private peerReadyState: Map<bigint, boolean> = new Map();
  private pendingCheckStates: Map<bigint, { resolve: () => void; reject: (e: Error) => void }> = new Map();

  // Queue for pending CheckState responses when tab is hidden
  private pendingCheckStateResponses: bigint[] = [];

  private readonly config: CheckStateConfig;

  constructor(config: CheckStateConfig) {
    this.config = config;
  }

  /**
   * Check if a peer is marked as ready (has passed CheckState handshake)
   */
  public isPeerReady(peerCid: bigint): boolean {
    return this.peerReadyState.get(peerCid) || false;
  }

  /**
   * Mark a peer as ready (e.g., on connection established or message received)
   */
  public markPeerReady(peerCid: bigint): void {
    if (!this.peerReadyState.get(peerCid)) {
      this.peerReadyState.set(peerCid, true);
      debugLog('CheckstateManager', `[P2P] Marked peer ${peerCid.toString().slice(0, 8)}... as ready`);
    }
  }

  /**
   * Clear ready state for a peer (e.g., when they disconnect)
   */
  public clearPeerReadyState(peerCid: bigint): void {
    this.peerReadyState.delete(peerCid);
    const pending = this.pendingCheckStates.get(peerCid);
    if (pending) {
      pending.reject(new Error('Peer disconnected'));
      this.pendingCheckStates.delete(peerCid);
    }
  }

  /**
   * Handle received CheckStateResponse - resolve pending promise
   */
  public handleCheckStateResponse(peerCid: bigint): void {
    debugLog('CheckstateManager', '[P2P] Received CheckStateResponse from peer:', peerCid);
    this.peerReadyState.set(peerCid, true);
    const pending = this.pendingCheckStates.get(peerCid);
    if (pending) {
      pending.resolve();
      this.pendingCheckStates.delete(peerCid);
    }
  }

  /**
   * Handle received CheckState - send CheckStateResponse
   */
  public async handleCheckState(peerCid: bigint): Promise<void> {
    debugLog('CheckstateManager', '[P2P] Received CheckState from peer:', peerCid, '- responding Ready');

    // Queue for flush when tab becomes visible (handles browser throttling in background tabs)
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.pendingCheckStateResponses.push(peerCid);
      debugLog('CheckstateManager', `[P2P] Tab hidden - queued CheckState response for ${peerCid}`);
    }
    // Always try to respond immediately (best effort - may be throttled in background)
    await this.sendCheckStateResponse(peerCid);
  }

  /**
   * Send CheckStateResponse to a peer
   */
  public async sendCheckStateResponse(peerCid: bigint): Promise<void> {
    const currentCid = await this.config.getCurrentCid();
    if (!currentCid) return;

    const response = createCheckStateResponse();
    const command = createMessagingLayerCommand(
      response,
      currentCid,
      peerCid,
      this.config.getLastMessageIndex(peerCid)
    );

    try {
      const bytes = serializeP2PCommand(command);
      await this.config.sendToP2P(peerCid, bytes);
      debugLog('CheckstateManager', '[P2P] Sent CheckStateResponse to peer:', peerCid);
    } catch (error) {
      console.error('[P2P] Failed to send CheckStateResponse:', error);
    }
  }

  /**
   * Ensure peer is ready for messaging by sending CheckState and waiting for response.
   * Must be called before sending any message to a peer.
   *
   * @param peerCid - The peer's CID to verify
   * @throws Error if peer doesn't respond within timeout
   */
  public async ensurePeerReady(peerCid: bigint): Promise<void> {
    // If already confirmed ready, skip handshake
    if (this.peerReadyState.get(peerCid)) {
      debugLog('CheckstateManager', '[P2P] Peer already marked as ready:', peerCid);
      return;
    }

    debugLog('CheckstateManager', '[P2P] Initiating CheckState handshake with peer:', peerCid);

    const currentCid = await this.config.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    // Create CheckState command
    const checkState = createCheckState();
    const command = createMessagingLayerCommand(
      checkState,
      currentCid,
      peerCid,
      this.config.getLastMessageIndex(peerCid)
    );

    // Create promise that resolves when CheckStateResponse received
    const readyPromise = new Promise<void>((resolve, reject) => {
      this.pendingCheckStates.set(peerCid, { resolve, reject });

      // Timeout handling
      setTimeout(() => {
        if (this.pendingCheckStates.has(peerCid)) {
          this.pendingCheckStates.delete(peerCid);
          reject(new Error(`Peer ${peerCid} did not respond to CheckState within ${this.config.timeout}ms`));
        }
      }, this.config.timeout);
    });

    // Send the CheckState request
    try {
      const bytes = serializeP2PCommand(command);
      await this.config.sendToP2P(peerCid, bytes);
      debugLog('CheckstateManager', '[P2P] Sent CheckState to peer:', peerCid);
    } catch (error) {
      // Clean up pending state on send failure
      this.pendingCheckStates.delete(peerCid);
      throw error;
    }

    // Wait for response
    await readyPromise;
    debugLog('CheckstateManager', '[P2P] Peer confirmed ready:', peerCid);
  }

  /**
   * Try to ensure peer is ready, but don't fail if CheckState times out.
   * Returns true if peer confirmed ready, false if timeout (proceed anyway).
   * The intersession layer manager in WASM handles reliability, so CheckState is optional.
   */
  public async tryEnsurePeerReady(peerCid: bigint): Promise<boolean> {
    try {
      await this.ensurePeerReady(peerCid);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('did not respond to CheckState')) {
        debugLog('CheckstateManager', `[P2P] CheckState timeout for ${peerCid}, proceeding with send anyway (transport layer handles reliability)`);
        return false;
      }
      throw error;  // Re-throw other errors
    }
  }

  /**
   * Flush any pending CheckState responses that were queued while tab was hidden.
   */
  public flushPendingCheckStateResponses(): void {
    if (this.pendingCheckStateResponses.length === 0) return;

    debugLog('CheckstateManager', `[P2P] Flushing ${this.pendingCheckStateResponses.length} pending CheckState responses`);
    for (const peerCid of this.pendingCheckStateResponses) {
      this.sendCheckStateResponse(peerCid).catch(error => {
        debugLog('CheckstateManager', '[P2P] Failed to send queued CheckStateResponse:', error);
      });
    }
    this.pendingCheckStateResponses = [];
  }
}
