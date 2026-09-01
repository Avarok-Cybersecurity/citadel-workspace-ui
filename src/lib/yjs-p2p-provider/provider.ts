/**
 * YJS P2P Provider - Main Provider Class
 *
 * Custom Yjs provider that syncs documents via P2P messaging.
 * Uses bidirectional sync protocol with hash verification.
 */

import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { eventEmitter } from '@/lib/event-emitter';
import { YjsMerkleTree, computeDocumentHash } from '@/lib/yjs-merkle-strategy';
import { debugLog } from '@/lib/debug-config';

import type { YjsOrigin, YjsP2PMessage, SyncState, PendingAck } from './types';
import { PERSISTED_LOAD_ORIGIN } from './types';

/**
 * Did this update come from the person at the keyboard?
 *
 * Only a local edit is worth sending. Everything else on this list arrived from
 * somewhere that already has it, and re-broadcasting it is at best redundant:
 * 'remote' and 'creator-resync' came FROM the peer, 'merkle-reconstruct' is a
 * local rebuild of state we already agreed on, and 'persisted-load' is a restore
 * from storage — which used to be untagged, so opening an editor pushed the
 * whole document at the peer over a transport one message per keystroke already
 * overruns.
 *
 * Exported so the tests assert against THIS rule rather than a copy of it. A
 * test carrying its own list would keep passing while this one changed.
 */
export function isLocalEdit(origin: YjsOrigin): boolean {
  return (
    origin !== 'remote' &&
    origin !== 'merkle-reconstruct' &&
    origin !== 'creator-resync' &&
    origin !== PERSISTED_LOAD_ORIGIN
  );
}
import { YJS_SYNC_COOLDOWN_MS, YJS_SYNC_RESET_DELAY_MS, YJS_HEALTH_CHECK_INTERVAL_MS } from './constants';
import { UpdateCoalescer } from './update-coalescer';
import { sendSyncMessage, sendUpdate, broadcastAwareness , type SendingContext } from './sending';
import { dispatchYjsMessage } from './message-dispatch';
import { checkPendingAcks, handleHashMismatch } from './ack-checker';

export class YjsP2PProvider {
  /** Buffers rapid edits into one merged update; see UpdateCoalescer. */
  private coalescer: UpdateCoalescer;
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

  private connected: boolean = false;
  private destroyed: boolean = false;
  private initialSyncComplete: boolean = false;
  private ackCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastSyncInitiated: number = 0;
  private syncInProgress: boolean = false;

  constructor(documentId: string, peerCid: string, doc: Y.Doc, ownCid: string | null, creatorCid: string | null = null) {
    this.doc = doc;
    this.documentId = documentId;
    this.peerCid = peerCid;
    this.ownCid = ownCid;
    this.creatorCid = creatorCid || ownCid;
    this.awareness = new Awareness(doc);
    this.merkleTree = YjsMerkleTree.fromDocument(doc, documentId, this.creatorCid);
    this.coalescer = new UpdateCoalescer((merged) => {
      if (this.destroyed) return;
      // Fold this batch into the tree BEFORE sending: the receiver compares
      // its hash AFTER applying, so the doc_hash on the wire must be the
      // POST-update hash. The reversed order made every non-empty update
      // read as "diverged" — a full resync per 300ms batch, which also
      // masked lost updates. COUPLED with the retransmit in ack-checker.ts.
      this.updateMerkleTree();
      sendUpdate(this.ctx, merged);
    });
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
    const self: this = this;
    return {
      get ownCid(): string | null { return self.ownCid; },
      get peerCid(): string { return self.peerCid; },
      get documentId(): string { return self.documentId; },
      get creatorCid(): string | null { return self.creatorCid; },
      get revision(): number { return self.revision; },
      set revision(v: number) { self.revision = v; },
      get merkleTree(): YjsMerkleTree | null { return self.merkleTree; },
      get pendingAcks(): Map<string, PendingAck> { return self.pendingAcks; },
      get doc(): Y.Doc { return self.doc; },
      get awareness(): Awareness { return self.awareness; },
      get syncState(): SyncState { return self.syncState; },
      set syncState(v: SyncState) { self.syncState = v; },
      get initialSyncComplete(): boolean { return self.initialSyncComplete; },
      set initialSyncComplete(v: boolean) { self.initialSyncComplete = v; },
      updateMerkleTree: () => self.updateMerkleTree(),
      handleHashMismatch: (h: string) => handleHashMismatch(self.ctx, h),
      initiateSync: () => self.initiateSync(),
    };
  }

  private setupUpdateHandler(): void {
    this.updateHandler = (update: Uint8Array, origin: YjsOrigin): void => {
      if (this.destroyed) return;
      if (!isLocalEdit(origin)) return;
      // Buffered, not sent: one message per keystroke overruns a stop-and-wait
      // transport and the later edits time out waiting for a turn.
      this.coalescer.add(update);
    };
    this.doc.on('update', this.updateHandler);
  }

  private setupAwarenessHandler(): void {
    this.awarenessHandler = ({ added, updated, removed }, origin): void => {
      if (this.destroyed) return;
      if (origin === 'remote') return;
      const changedClients: number[] = added.concat(updated).concat(removed);
      if (changedClients.length > 0) {
        const update: Uint8Array<ArrayBufferLike> = encodeAwarenessUpdate(this.awareness, changedClients);
        broadcastAwareness(this.ctx, update);
      }
    };
    this.awareness.on('update', this.awarenessHandler);
  }

  private setupMessageListener(): void {
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
      const docId: string | undefined = typeof payload.document_id === 'string' ? payload.document_id : undefined;
      if (docId !== undefined && docId !== this.documentId) return;
      dispatchYjsMessage(this.ctx, payload as unknown as YjsP2PMessage);
    });
  }

  private initiateSync(): void {
    const now: number = Date.now();
    if (this.syncInProgress || (now - this.lastSyncInitiated < YJS_SYNC_COOLDOWN_MS)) {
      debugLog('YjsP2PProvider', `[Yjs] Sync throttled (cooldown: ${Math.ceil((YJS_SYNC_COOLDOWN_MS - (now - this.lastSyncInitiated)) / 1000)}s remaining)`);
      return;
    }
    this.syncInProgress = true;
    this.lastSyncInitiated = now;
    debugLog('YjsP2PProvider', `[Yjs] Initiating sync for document ${this.documentId} with peer ${this.peerCid}`);
    const stateVector: Uint8Array<ArrayBufferLike> = Y.encodeStateVector(this.doc);
    sendSyncMessage(this.ctx, 'sync_step1', stateVector, false);
    this.syncState = 'awaiting_step1_response';
    setTimeout(() => { this.syncInProgress = false; }, YJS_SYNC_RESET_DELAY_MS);
  }

  private startAckChecker(): void {
    this.ackCheckInterval = setInterval(() => checkPendingAcks(this.ctx), YJS_HEALTH_CHECK_INTERVAL_MS);
  }

  private updateMerkleTree(): void {
    if (this.merkleTree) {
      this.merkleTree.updateFromDocument(this.doc);
    } else {
      this.merkleTree = YjsMerkleTree.fromDocument(this.doc, this.documentId, this.creatorCid);
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  setLocalState(state: Record<string, unknown>): void { this.awareness.setLocalState(state); }
  /**
   * Set ONE awareness field, leaving the rest of the local state alone.
   *
   * `setLocalState` replaces the whole object. TipTap's CollaborationCursor keeps
   * its `cursor` field in this same awareness state, so any caller that only
   * wanted to set its own field was wiping every peer's view of this user's
   * cursor and selection as a side effect.
   */
  setLocalStateField(field: string, value: unknown): void {
    this.awareness.setLocalStateField(field, value);
  }
  getStates(): ReturnType<Awareness['getStates']> { return this.awareness.getStates(); }
  get isConnected(): boolean { return this.connected && !this.destroyed; }
  get isSynced(): boolean { return this.initialSyncComplete; }
  getSyncState(): SyncState { return this.syncState; }
  getDocumentHash(): string { return this.merkleTree?.getRootHash() ?? computeDocumentHash(this.doc); }
  forceResync(): void { this.initiateSync(); }

  destroy(): void {
    if (this.destroyed) return;
    // Flushed BEFORE the destroyed flag, or edits made in the last 120ms are
    // silently dropped -- closing a document right after typing is the normal
    // way to use one.
    this.coalescer.flush();
    // Departure goes out HERE, while the awareness 'update' handler is still
    // attached and the destroyed flag is still down. `awareness.destroy()`
    // below fires its own removal only after both, so no peer ever heard it:
    // whoever closed a document stayed a ghost cursor for everyone else until
    // the ~30s awareness timeout expired. Guarded so a failure to encode or
    // send can never abort the teardown that follows -- which is all the old
    // suppression actually protected.
    try {
      removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    } catch (error) {
      debugLog('YjsP2PProvider', 'destroy: departure broadcast failed:', error);
    }
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
