/**
 * YJS P2P Provider - Main Provider Class
 *
 * Custom Yjs provider that syncs documents via P2P messaging.
 * Uses bidirectional sync protocol with hash verification.
 */

import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { eventEmitter } from '@/lib/event-emitter';
import { YjsMerkleTree, computeDocumentHash } from '@/lib/yjs-merkle-strategy';
import { debugLog } from '@/lib/debug-config';

import type { YjsOrigin, YjsP2PMessage, YjsSyncMessage, SyncState, PendingAck } from './types';
import { YJS_SYNC_COOLDOWN_MS, YJS_SYNC_RESET_DELAY_MS, YJS_HEALTH_CHECK_INTERVAL_MS } from './constants';
import { sendSyncMessage, sendUpdate, broadcastAwareness } from './sending';
import type { SendingContext } from './sending';
import { handleSyncStep1, handleSyncStep2, handleUpdate, handleFullState, handleRequestFullState, handleHashCheck } from './sync-handlers';
import { handleAwarenessMessage, handleAckMessage, handleDivergenceMessage } from './message-handlers';
import { checkPendingAcks, handleHashMismatch } from './ack-checker';

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
  private updateHandler: ((update: Uint8Array, origin: YjsOrigin) => void) | null = null;
  private awarenessHandler: ((update: { added: number[]; updated: number[]; removed: number[] }, origin: YjsOrigin) => void) | null = null;

  private connected = false;
  private destroyed = false;
  private initialSyncComplete = false;
  private ackCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastSyncInitiated: number = 0;
  private syncInProgress = false;

  constructor(documentId: string, peerCid: string, doc: Y.Doc, ownCid: string | null, creatorCid: string | null = null) {
    this.doc = doc;
    this.documentId = documentId;
    this.peerCid = peerCid;
    this.ownCid = ownCid;
    this.creatorCid = creatorCid || ownCid;
    this.awareness = new Awareness(doc);
    this.merkleTree = YjsMerkleTree.fromDocument(doc, documentId, this.creatorCid);
    this.setupUpdateHandler();
    this.setupAwarenessHandler();
    this.setupMessageListener();
    this.startAckChecker();
    this.initiateSync();
    this.connected = true;
  }

  /** Build context proxy for extracted handler functions */
  private get ctx(): SendingContext & {
    doc: Y.Doc; awareness: Awareness; syncState: SyncState;
    initialSyncComplete: boolean;
    updateMerkleTree: () => void; handleHashMismatch: (h: string) => void;
    initiateSync: () => void;
  } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- required for getter/setter context binding
    const self = this;
    return {
      get ownCid() { return self.ownCid; },
      get peerCid() { return self.peerCid; },
      get documentId() { return self.documentId; },
      get creatorCid() { return self.creatorCid; },
      get revision() { return self.revision; },
      set revision(v: number) { self.revision = v; },
      get merkleTree() { return self.merkleTree; },
      get pendingAcks() { return self.pendingAcks; },
      get doc() { return self.doc; },
      get awareness() { return self.awareness; },
      get syncState() { return self.syncState; },
      set syncState(v: SyncState) { self.syncState = v; },
      get initialSyncComplete() { return self.initialSyncComplete; },
      set initialSyncComplete(v: boolean) { self.initialSyncComplete = v; },
      updateMerkleTree: () => self.updateMerkleTree(),
      handleHashMismatch: (h: string) => handleHashMismatch(self.ctx, h),
      initiateSync: () => self.initiateSync(),
    };
  }

  private setupUpdateHandler() {
    this.updateHandler = (update: Uint8Array, origin: YjsOrigin) => {
      if (this.destroyed) return;
      if (origin === 'remote' || origin === 'merkle-reconstruct' || origin === 'creator-resync') return;
      sendUpdate(this.ctx, update);
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
        broadcastAwareness(this.ctx, update);
      }
    };
    this.awareness.on('update', this.awarenessHandler);
  }

  private setupMessageListener() {
    // Listen on `yjs:p2p-command` rather than `p2p:raw-message`.
    // `message-handler.ts` already CBOR-decodes incoming bytes into a
    // `P2PCommand` and dispatches `YjsP2PSync` payloads through this
    // event — so the provider receives a typed object directly and no
    // longer has to JSON.parse a raw byte stream, which used to throw
    // (silently caught) for every chat-layer CBOR message and conflict
    // with the receiver's own cbor-x decode (where it ALSO threw on
    // our JSON bytes). Single decode path now.
    this.messageListener = eventEmitter.on('yjs:p2p-command', ({ peerCid, payload }: { peerCid: bigint; payload: Record<string, unknown> }) => {
      if (this.destroyed) return;
      // `this.peerCid` is a string; compare via toString (display/key use).
      if (peerCid.toString() !== this.peerCid) return;
      // Filter by document_id when present (sync/awareness/ack carry it;
      // a future generic Yjs command might not).
      const docId = typeof payload.document_id === 'string' ? payload.document_id : undefined;
      if (docId !== undefined && docId !== this.documentId) return;
      this.handleMessage(payload as unknown as YjsP2PMessage);
    });
  }

  private initiateSync() {
    const now = Date.now();
    if (this.syncInProgress || (now - this.lastSyncInitiated < YJS_SYNC_COOLDOWN_MS)) {
      debugLog('YjsP2PProvider', `[Yjs] Sync throttled (cooldown: ${Math.ceil((YJS_SYNC_COOLDOWN_MS - (now - this.lastSyncInitiated)) / 1000)}s remaining)`);
      return;
    }
    this.syncInProgress = true;
    this.lastSyncInitiated = now;
    debugLog('YjsP2PProvider', `[Yjs] Initiating sync for document ${this.documentId} with peer ${this.peerCid}`);
    const stateVector = Y.encodeStateVector(this.doc);
    sendSyncMessage(this.ctx, 'sync_step1', stateVector, false);
    this.syncState = 'awaiting_step1_response';
    setTimeout(() => { this.syncInProgress = false; }, YJS_SYNC_RESET_DELAY_MS);
  }

  private handleMessage(message: YjsP2PMessage) {
    switch (message.type) {
      case 'yjs_sync': this.handleSyncMessage(message); break;
      case 'yjs_awareness': handleAwarenessMessage(this.ctx, message); break;
      case 'yjs_ack': handleAckMessage(this.ctx, message); break;
      case 'yjs_divergence': handleDivergenceMessage(this.ctx, message); break;
      default:
        // `setupMessageListener` casts the CBOR payload with `as unknown as
        // YjsP2PMessage`; a future `yjs_*` variant added on the sender side
        // before this switch is updated would otherwise be silently dropped.
        // Surface the unknown type in dev tools so the gap is visible.
        debugLog(
          'YjsP2PProvider',
          'handleMessage: unknown Yjs message type',
          (message as { type?: unknown }).type,
        );
    }
  }

  private handleSyncMessage(message: YjsSyncMessage) {
    const data = new Uint8Array(message.data);
    switch (message.sub_type) {
      case 'sync_step1': handleSyncStep1(this.ctx, data, message); break;
      case 'sync_step2': handleSyncStep2(this.ctx, data, message); break;
      case 'update': handleUpdate(this.ctx, data, message); break;
      case 'full_state': handleFullState(this.ctx, data, message); break;
      case 'request_full': handleRequestFullState(this.ctx, message); break;
      case 'hash_check': handleHashCheck(this.ctx, message); break;
    }
  }

  private startAckChecker() {
    this.ackCheckInterval = setInterval(() => checkPendingAcks(this.ctx), YJS_HEALTH_CHECK_INTERVAL_MS);
  }

  private updateMerkleTree() {
    if (this.merkleTree) {
      this.merkleTree.updateFromDocument(this.doc);
    } else {
      this.merkleTree = YjsMerkleTree.fromDocument(this.doc, this.documentId, this.creatorCid);
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  setLocalState(state: Record<string, unknown>) { this.awareness.setLocalState(state); }
  getStates() { return this.awareness.getStates(); }
  get isConnected() { return this.connected && !this.destroyed; }
  get isSynced() { return this.initialSyncComplete; }
  getSyncState(): SyncState { return this.syncState; }
  getDocumentHash(): string { return this.merkleTree?.getRootHash() ?? computeDocumentHash(this.doc); }
  forceResync() { this.initiateSync(); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;
    if (this.ackCheckInterval) { clearInterval(this.ackCheckInterval); this.ackCheckInterval = null; }
    if (this.updateHandler) { this.doc.off('update', this.updateHandler); }
    if (this.awarenessHandler) { this.awareness.off('update', this.awarenessHandler); }
    if (this.messageListener) { this.messageListener(); this.messageListener = null; }
    this.pendingAcks.clear();
    this.awareness.destroy();
  }
}
