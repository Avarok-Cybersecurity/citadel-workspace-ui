/**
 * YJS P2P Provider with Bidirectional Sync
 *
 * This provider implements a proper two-way sync protocol:
 * 1. SyncStep1: Exchange state vectors
 * 2. SyncStep2: Exchange differential updates
 * 3. ACK: Verify sync with hash comparison
 * 4. Divergence Detection: Use Merkle trees to find mismatches
 * 5. Creator Authority: Creator's state wins on unrecoverable divergence
 */

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import {
  YjsMerkleTree,
  computeDocumentHash,
  determineSyncAction,
  type YjsMerkleProof,
} from './yjs-merkle-strategy';
import { sha256Sync } from './merkle-tree';
import { debugLog } from '@/lib/debug-config';

// ============================================
// MESSAGE TYPES
// ============================================

/**
 * Sync message sub-types for proper protocol handling
 */
type SyncSubType =
  | 'sync_step1'      // Initial state vector exchange
  | 'sync_step2'      // Differential update
  | 'update'          // Live document update
  | 'ack'             // Acknowledgment with hash
  | 'hash_check'      // Request hash verification
  | 'full_state'      // Full state for creator authority resync
  | 'request_full';   // Request full state from creator

interface YjsSyncMessage {
  type: 'yjs_sync';
  sub_type: SyncSubType;
  document_id: string;
  data: number[];           // Uint8Array as array
  doc_hash?: string;        // SHA-256 of current state
  revision?: number;        // Revision counter
  message_id: string;       // Unique message ID
  requires_ack?: boolean;   // Whether ACK is expected
  is_creator?: boolean;     // Whether sender is document creator
}

interface YjsAwarenessMessage {
  type: 'yjs_awareness';
  document_id: string;
  awareness: number[]; // Uint8Array as array
}

interface YjsAckMessage {
  type: 'yjs_ack';
  document_id: string;
  message_id: string;       // ID of message being acknowledged
  local_hash: string;       // Local document hash after applying
  revision: number;
}

interface YjsDivergenceMessage {
  type: 'yjs_divergence';
  document_id: string;
  local_hash: string;
  remote_hash: string;
  diverged_chunks?: number[];
  action: 'request_chunks' | 'full_resync';
}

type YjsP2PMessage = YjsSyncMessage | YjsAwarenessMessage | YjsAckMessage | YjsDivergenceMessage;

// ============================================
// SYNC STATE MACHINE
// ============================================

type SyncState =
  | 'idle'
  | 'awaiting_step1_response'
  | 'awaiting_step2_response'
  | 'synced'
  | 'diverged';

interface PendingAck {
  messageId: string;
  sentAt: number;
  expectedHash?: string;
  retryCount: number;
}

// ============================================
// PROVIDER CLASS
// ============================================

/**
 * Custom Yjs provider that syncs documents via P2P messaging
 * Uses bidirectional sync protocol with hash verification
 */
export class YjsP2PProvider {
  doc: Y.Doc;
  awareness: Awareness;
  documentId: string;
  peerCid: string;

  private ownCid: string | null;
  private creatorCid: string | null;
  private merkleTree: YjsMerkleTree | null = null;
  private syncState: SyncState = 'idle';
  private pendingAcks: Map<string, PendingAck> = new Map();
  private revision: number = 0;

  private messageListener: (() => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.Doc 'update' event callback has origin typed as any
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Awareness 'update' event callback has origin typed as any
  private awarenessHandler: ((update: { added: number[]; updated: number[]; removed: number[] }, origin: any) => void) | null = null;

  private connected = false;
  private destroyed = false;
  private initialSyncComplete = false;

  // Retry configuration
  private readonly ACK_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;
  private ackCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Sync debounce to prevent infinite loops
  private lastSyncInitiated: number = 0;
  private readonly SYNC_COOLDOWN = 10000; // 10 seconds minimum between sync initiations
  private syncInProgress = false;

  constructor(
    documentId: string,
    peerCid: string,
    doc: Y.Doc,
    ownCid: string | null,
    creatorCid: string | null = null
  ) {
    this.doc = doc;
    this.documentId = documentId;
    this.peerCid = peerCid;
    this.ownCid = ownCid;
    this.creatorCid = creatorCid || ownCid; // Assume creator if not specified
    this.awareness = new Awareness(doc);

    // Initialize Merkle tree
    this.merkleTree = YjsMerkleTree.fromDocument(doc, documentId, this.creatorCid);

    // Set up handlers
    this.setupUpdateHandler();
    this.setupAwarenessHandler();
    this.setupMessageListener();

    // Start ACK timeout checker
    this.startAckChecker();

    // Initiate bidirectional sync
    this.initiateSync();

    this.connected = true;
  }

  // ============================================
  // HANDLER SETUP
  // ============================================

  private setupUpdateHandler() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.Doc 'update' callback origin is any
    this.updateHandler = (update: Uint8Array, origin: any) => {
      if (this.destroyed) return;
      // Don't re-send updates that came from the peer
      if (origin === 'remote' || origin === 'merkle-reconstruct' || origin === 'creator-resync') return;

      // Send update to peer
      this.sendUpdate(update);

      // Update Merkle tree
      this.updateMerkleTree();
    };

    this.doc.on('update', this.updateHandler);
  }

  private setupAwarenessHandler() {
    this.awarenessHandler = ({ added, updated, removed }, origin) => {
      if (this.destroyed) return;
      if (origin === 'remote') return;

      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length > 0) {
        const update = encodeAwarenessUpdate(this.awareness, changedClients);
        this.broadcastAwareness(update);
      }
    };

    this.awareness.on('update', this.awarenessHandler);
  }

  private setupMessageListener() {
    // Message is now Uint8Array (MessagePack or JSON bytes)
    // YJS messages use JSON, chat messages use MessagePack
    this.messageListener = eventEmitter.on('p2p:raw-message', ({ peerCid, message }: { peerCid: string; message: Uint8Array }) => {
      if (this.destroyed) return;
      if (peerCid !== this.peerCid) return;

      try {
        // Decode Uint8Array to string and try JSON parse
        // If it's a valid JSON YJS message, handle it
        // If it's MessagePack (chat message), JSON.parse will throw and we ignore it
        const decoded = new TextDecoder().decode(message);
        const parsed = JSON.parse(decoded) as YjsP2PMessage;

        // Check if it's a Yjs message for our document
        if ('document_id' in parsed && parsed.document_id !== this.documentId) return;

        this.handleMessage(parsed);
      } catch (error) {
        // Not a Yjs message (likely MessagePack chat message), ignore
      }
    });
  }

  // ============================================
  // SYNC INITIATION
  // ============================================

  /**
   * Initiate bidirectional sync with peer
   * Has built-in cooldown to prevent infinite sync loops
   */
  private initiateSync() {
    const now = Date.now();

    // Prevent sync spam - enforce cooldown
    if (this.syncInProgress || (now - this.lastSyncInitiated < this.SYNC_COOLDOWN)) {
      debugLog('YjsP2pProvider', `[Yjs] Sync throttled (cooldown: ${Math.ceil((this.SYNC_COOLDOWN - (now - this.lastSyncInitiated)) / 1000)}s remaining)`);
      return;
    }

    this.syncInProgress = true;
    this.lastSyncInitiated = now;

    debugLog('YjsP2pProvider', `[Yjs] Initiating sync for document ${this.documentId} with peer ${this.peerCid}`);

    // Send SyncStep1 (our state vector)
    // NOTE: SyncStep1 does NOT require ACK - SyncStep2 is the response
    const stateVector = Y.encodeStateVector(this.doc);
    this.sendSyncMessage('sync_step1', stateVector, false);

    this.syncState = 'awaiting_step1_response';

    // Reset sync in progress after a short delay
    setTimeout(() => {
      this.syncInProgress = false;
    }, 2000);
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  private handleMessage(message: YjsP2PMessage) {
    switch (message.type) {
      case 'yjs_sync':
        this.handleSyncMessage(message);
        break;
      case 'yjs_awareness':
        this.handleAwarenessMessage(message);
        break;
      case 'yjs_ack':
        this.handleAckMessage(message);
        break;
      case 'yjs_divergence':
        this.handleDivergenceMessage(message);
        break;
    }
  }

  /**
   * Handle sync messages based on sub_type
   */
  private handleSyncMessage(message: YjsSyncMessage) {
    const data = new Uint8Array(message.data);

    switch (message.sub_type) {
      case 'sync_step1':
        this.handleSyncStep1(data, message);
        break;
      case 'sync_step2':
        this.handleSyncStep2(data, message);
        break;
      case 'update':
        this.handleUpdate(data, message);
        break;
      case 'full_state':
        this.handleFullState(data, message);
        break;
      case 'request_full':
        this.handleRequestFullState(message);
        break;
      case 'hash_check':
        this.handleHashCheck(message);
        break;
    }
  }

  /**
   * Handle SyncStep1: Peer sent their state vector
   * We should:
   * 1. Send our own state vector (if we haven't)
   * 2. Compute and send the diff they need (SyncStep2)
   */
  private handleSyncStep1(stateVector: Uint8Array, message: YjsSyncMessage) {
    // Avoid responding to duplicate/old sync messages
    if (this.syncState === 'synced' && this.initialSyncComplete) {
      debugLog('YjsP2pProvider', `[Yjs] Ignoring SyncStep1 - already synced`);
      // Just send SyncStep2 with any updates they might need
      const diff = Y.encodeStateAsUpdate(this.doc, stateVector);
      if (diff.length > 2) { // More than empty update
        this.sendSyncMessage('sync_step2', diff, false); // No ACK needed for response
      }
      return;
    }

    debugLog('YjsP2pProvider', `[Yjs] Received SyncStep1 from peer`);

    // Compute diff that peer needs
    const diff = Y.encodeStateAsUpdate(this.doc, stateVector);

    // Only send our state vector back if we're in idle state (haven't initiated sync yet)
    // This prevents the ping-pong pattern
    if (this.syncState === 'idle') {
      const myStateVector = Y.encodeStateVector(this.doc);
      this.sendSyncMessage('sync_step1', myStateVector, false);
    }

    // Send SyncStep2 with the diff they need (no ACK required - reduces traffic)
    this.sendSyncMessage('sync_step2', diff, false);

    // Update state
    this.syncState = 'awaiting_step2_response';
  }

  /**
   * Handle SyncStep2: Peer sent differential update
   */
  private handleSyncStep2(diff: Uint8Array, message: YjsSyncMessage) {
    // Only log if this is the initial sync or a significant update
    if (!this.initialSyncComplete) {
      debugLog('YjsP2pProvider', `[Yjs] Initial sync: received ${diff.length} bytes from peer`);
    }

    // Apply the diff
    Y.applyUpdate(this.doc, diff, 'remote');

    // Update Merkle tree
    this.updateMerkleTree();

    // Send ACK with our current hash
    this.sendAck(message.message_id);

    // Mark initial sync as complete
    this.initialSyncComplete = true;
    this.syncState = 'synced';

    // Emit sync complete event
    eventEmitter.emit('yjs:sync-complete', { documentId: this.documentId });
    eventEmitter.emit('yjs:document-update', { documentId: this.documentId });
  }

  /**
   * Handle live update during normal operation
   */
  private handleUpdate(update: Uint8Array, message: YjsSyncMessage) {
    // Apply the update
    Y.applyUpdate(this.doc, update, 'remote');

    // Update Merkle tree
    this.updateMerkleTree();

    // Send ACK if required
    if (message.requires_ack) {
      this.sendAck(message.message_id);
    }

    // Verify hash matches if provided
    if (message.doc_hash && this.merkleTree) {
      const localHash = this.merkleTree.getRootHash();
      if (localHash !== message.doc_hash) {
        console.warn(`[Yjs] Hash mismatch after update! Local: ${localHash}, Remote: ${message.doc_hash}`);
        this.handleHashMismatch(message.doc_hash);
      }
    }

    // Emit update event for UI
    eventEmitter.emit('yjs:document-update', { documentId: this.documentId });
  }

  /**
   * Handle full state from creator (divergence recovery)
   */
  private handleFullState(fullState: Uint8Array, message: YjsSyncMessage) {
    debugLog('YjsP2pProvider', `[Yjs] Received full state from creator (${fullState.length} bytes)`);

    // Apply creator's authoritative state
    this.doc.transact(() => {
      Y.applyUpdate(this.doc, fullState, 'creator-resync');
    });

    // Rebuild Merkle tree
    this.updateMerkleTree();

    // Send ACK
    this.sendAck(message.message_id);

    this.syncState = 'synced';
    eventEmitter.emit('yjs:document-update', { documentId: this.documentId });
  }

  /**
   * Handle request for full state (from collaborator)
   */
  private handleRequestFullState(message: YjsSyncMessage) {
    // Only creator should respond
    if (this.ownCid !== this.creatorCid) {
      debugLog('YjsP2pProvider', `[Yjs] Ignoring full state request - not the creator`);
      return;
    }

    debugLog('YjsP2pProvider', `[Yjs] Sending full state as creator`);

    const fullState = Y.encodeStateAsUpdate(this.doc);
    this.sendSyncMessage('full_state', fullState, true);
  }

  /**
   * Handle hash check request
   */
  private handleHashCheck(message: YjsSyncMessage) {
    if (!this.merkleTree) return;

    const localHash = this.merkleTree.getRootHash();

    if (message.doc_hash && localHash !== message.doc_hash) {
      this.handleHashMismatch(message.doc_hash);
    } else {
      // Send our hash back for verification
      this.sendSyncMessage('hash_check', new Uint8Array(0), false, localHash);
    }
  }

  /**
   * Handle awareness message
   */
  private handleAwarenessMessage(message: YjsAwarenessMessage) {
    const update = new Uint8Array(message.awareness);
    applyAwarenessUpdate(this.awareness, update, 'remote');
  }

  /**
   * Handle ACK message
   */
  private handleAckMessage(message: YjsAckMessage) {
    const pending = this.pendingAcks.get(message.message_id);
    if (pending) {
      this.pendingAcks.delete(message.message_id);
      debugLog('YjsP2pProvider', `[Yjs] Received ACK for ${message.message_id}`);

      // Verify hash if we have it
      if (this.merkleTree && message.local_hash) {
        const localHash = this.merkleTree.getRootHash();
        if (localHash !== message.local_hash) {
          console.warn(`[Yjs] Hash mismatch in ACK! Local: ${localHash}, Remote: ${message.local_hash}`);
          this.handleHashMismatch(message.local_hash);
        }
      }
    }
  }

  /**
   * Handle divergence notification
   */
  private handleDivergenceMessage(message: YjsDivergenceMessage) {
    debugLog('YjsP2pProvider', `[Yjs] Received divergence notification: ${message.action}`);

    this.syncState = 'diverged';

    if (message.action === 'full_resync') {
      // If we're the creator, send full state
      if (this.ownCid === this.creatorCid) {
        const fullState = Y.encodeStateAsUpdate(this.doc);
        this.sendSyncMessage('full_state', fullState, true);
      } else {
        // Request full state from creator
        this.sendSyncMessage('request_full', new Uint8Array(0), false);
      }
    }
  }

  // ============================================
  // SENDING METHODS
  // ============================================

  /**
   * Send a sync message with proper structure
   */
  private sendSyncMessage(
    subType: SyncSubType,
    data: Uint8Array,
    requiresAck: boolean,
    docHash?: string
  ) {
    if (!this.ownCid) return;

    const messageId = this.generateMessageId();
    const hash = docHash ?? (this.merkleTree?.getRootHash());

    const message: YjsSyncMessage = {
      type: 'yjs_sync',
      sub_type: subType,
      document_id: this.documentId,
      data: Array.from(data),
      doc_hash: hash,
      revision: this.revision,
      message_id: messageId,
      requires_ack: requiresAck,
      is_creator: this.ownCid === this.creatorCid,
    };

    if (requiresAck) {
      this.pendingAcks.set(messageId, {
        messageId,
        sentAt: Date.now(),
        expectedHash: hash,
        retryCount: 0,
      });
    }

    this.sendP2PMessage(message);
  }

  /**
   * Send a live document update
   */
  private sendUpdate(update: Uint8Array) {
    this.revision++;
    this.sendSyncMessage('update', update, true);
  }

  /**
   * Send ACK for a received message
   */
  private sendAck(messageId: string) {
    if (!this.ownCid) return;

    const message: YjsAckMessage = {
      type: 'yjs_ack',
      document_id: this.documentId,
      message_id: messageId,
      local_hash: this.merkleTree?.getRootHash() ?? '',
      revision: this.revision,
    };

    this.sendP2PMessage(message);
  }

  /**
   * Send awareness update
   */
  private broadcastAwareness(update: Uint8Array) {
    if (!this.ownCid) return;

    const message: YjsAwarenessMessage = {
      type: 'yjs_awareness',
      document_id: this.documentId,
      awareness: Array.from(update),
    };

    this.sendP2PMessage(message);
  }

  /**
   * Send P2P message via websocket service
   */
  private sendP2PMessage(message: YjsP2PMessage) {
    if (!this.ownCid) return;

    websocketService.sendP2PMessage(
      BigInt(this.ownCid),
      BigInt(this.peerCid),
      JSON.stringify(message)
    ).catch(error => {
      console.error('[Yjs] Failed to send message:', error);
    });
  }

  // ============================================
  // DIVERGENCE HANDLING
  // ============================================

  /**
   * Handle hash mismatch - initiate divergence recovery
   */
  private handleHashMismatch(remoteHash: string) {
    console.warn(`[Yjs] Hash mismatch detected, initiating divergence recovery`);

    this.syncState = 'diverged';

    // If we're the creator, send full state
    if (this.ownCid === this.creatorCid) {
      debugLog('YjsP2pProvider', `[Yjs] Creator authority: broadcasting full state`);
      const fullState = Y.encodeStateAsUpdate(this.doc);
      this.sendSyncMessage('full_state', fullState, true);
    } else {
      // Request full state from creator
      debugLog('YjsP2pProvider', `[Yjs] Collaborator: requesting full state from creator`);
      this.sendSyncMessage('request_full', new Uint8Array(0), false);
    }
  }

  // ============================================
  // ACK TIMEOUT HANDLING
  // ============================================

  private startAckChecker() {
    // Check less frequently to reduce overhead
    this.ackCheckInterval = setInterval(() => {
      this.checkPendingAcks();
    }, 5000); // Check every 5 seconds instead of every 1 second
  }

  private checkPendingAcks() {
    const now = Date.now();
    let timedOutCount = 0;

    for (const [messageId, pending] of this.pendingAcks.entries()) {
      if (now - pending.sentAt > this.ACK_TIMEOUT) {
        timedOutCount++;

        if (pending.retryCount < this.MAX_RETRIES) {
          console.warn(`[Yjs] ACK timeout for ${messageId}, retry ${pending.retryCount + 1}/${this.MAX_RETRIES}`);
          pending.retryCount++;
          pending.sentAt = now;

          // DON'T re-initiate full sync on every ACK timeout
          // Just log it - the sync may have already completed via another message
        } else {
          console.warn(`[Yjs] ACK timeout for ${messageId} - giving up (peer may be offline)`);
          this.pendingAcks.delete(messageId);
          // Don't trigger divergence recovery - just clear the pending ACK
          // The next actual interaction will trigger proper sync if needed
        }
      }
    }

    // Only re-initiate sync if we have many timed out ACKs and haven't synced yet
    if (timedOutCount > 3 && !this.initialSyncComplete) {
      debugLog('YjsP2pProvider', `[Yjs] Multiple ACK timeouts (${timedOutCount}), attempting resync`);
      this.initiateSync();
    }
  }

  // ============================================
  // MERKLE TREE MANAGEMENT
  // ============================================

  private updateMerkleTree() {
    if (this.merkleTree) {
      this.merkleTree.updateFromDocument(this.doc);
    } else {
      this.merkleTree = YjsMerkleTree.fromDocument(this.doc, this.documentId, this.creatorCid);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private generateMessageId(): string {
    return `${this.documentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set local awareness state (cursor position, user info, etc.)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Awareness.setLocalState expects { [x: string]: any } | null
  setLocalState(state: Record<string, any>) {
    this.awareness.setLocalState(state);
  }

  /**
   * Get awareness states of all clients
   */
  getStates() {
    return this.awareness.getStates();
  }

  /**
   * Check if provider is connected
   */
  get isConnected() {
    return this.connected && !this.destroyed;
  }

  /**
   * Check if initial sync is complete
   */
  get isSynced() {
    return this.initialSyncComplete;
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return this.syncState;
  }

  /**
   * Get current document hash
   */
  getDocumentHash(): string {
    return this.merkleTree?.getRootHash() ?? computeDocumentHash(this.doc);
  }

  /**
   * Force re-sync with peer
   */
  forceResync() {
    this.initiateSync();
  }

  /**
   * Destroy the provider and clean up
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;

    // Clear ACK checker
    if (this.ackCheckInterval) {
      clearInterval(this.ackCheckInterval);
      this.ackCheckInterval = null;
    }

    // Remove listeners
    if (this.updateHandler) {
      this.doc.off('update', this.updateHandler);
    }
    if (this.awarenessHandler) {
      this.awareness.off('update', this.awarenessHandler);
    }

    if (this.messageListener) {
      this.messageListener();
      this.messageListener = null;
    }

    // Clear pending ACKs
    this.pendingAcks.clear();

    // Clear awareness
    this.awareness.destroy();
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a Yjs P2P provider for a document
 */
export function createYjsP2PProvider(
  documentId: string,
  peerCid: string,
  ownCid: string | null,
  doc?: Y.Doc,
  creatorCid?: string | null
): YjsP2PProvider {
  const ydoc = doc || new Y.Doc();
  return new YjsP2PProvider(documentId, peerCid, ydoc, ownCid, creatorCid ?? null);
}
