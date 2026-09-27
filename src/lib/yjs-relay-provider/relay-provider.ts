/**
 * A live document kept in sync through the server, for office and room chats.
 *
 * The server holds each document's one merged state and numbers every update it accepts
 * (citadel-workspace-server-kernel `live_docs`), so this needs none of the P2P provider's
 * machinery (acks, hashes, authority). It:
 * - opens the document and applies the server's whole state;
 * - sends its own edits, coalesced as the P2P provider coalesces them;
 * - applies a remote update when it is the next number, and re-opens on a gap, which is always
 *   safe: applying a Yjs state again changes nothing already applied.
 *
 * Presence (who else is editing, their cursors) is kept locally only for now: the relay carries
 * the document, not awareness.
 */
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { eventEmitter } from '@/lib/event-emitter';
import { UpdateCoalescer } from '@/lib/yjs-p2p-provider/update-coalescer';
import type { CollabProvider } from '@/lib/collab/collab-provider';

/** What the provider needs from the wire; the real one is relay-transport.ts. */
export interface RelayTransport {
  open(): Promise<{ seq: number; state: Uint8Array }>;
  /** Resolves with the number the server gave this update; rejects with its refusal. */
  send(update: Uint8Array): Promise<number>;
  /** Other members' accepted updates, in the order they arrive. */
  onRemote(listener: (seq: number, update: Uint8Array) => void): () => void;
}

/** Marks updates this provider applied from the server, so they are not sent back. */
export const RELAY_ORIGIN: symbol = Symbol('yjs-relay');

export class YjsRelayProvider implements CollabProvider {
  readonly awareness: Awareness;
  private lastSeq: number = 0;
  private opening: Promise<void> | null = null;
  private destroyed: boolean = false;
  private readonly coalescer: UpdateCoalescer;
  private readonly unsubscribe: () => void;
  private readonly onLocal: (update: Uint8Array, origin: unknown) => void;

  constructor(
    private readonly doc: Y.Doc,
    private readonly documentId: string,
    private readonly transport: RelayTransport,
    /** Told why an edit was refused (too large, the document full): this copy then differs from
     *  everyone else's until it is re-opened, and the user should know. */
    private readonly reportRefusal: (reason: string) => void,
  ) {
    this.awareness = new Awareness(doc);
    this.coalescer = new UpdateCoalescer((update: Uint8Array) => { const _: Promise<void> = this.push(update); });
    this.onLocal = (update: Uint8Array, origin: unknown): void => {
      if (origin !== RELAY_ORIGIN) this.coalescer.add(update);
    };
    doc.on('update', this.onLocal);
    this.unsubscribe = transport.onRemote((seq: number, update: Uint8Array) => this.remote(seq, update));
    const _: Promise<void> = this.reopen();
  }

  /** Re-open from the server's whole state; one at a time. */
  private reopen(): Promise<void> {
    this.opening ??= (async (): Promise<void> => {
      try {
        const { seq, state } = await this.transport.open();
        if (this.destroyed) return;
        if (state.length > 0) Y.applyUpdate(this.doc, state, RELAY_ORIGIN);
        this.lastSeq = Math.max(this.lastSeq, seq);
        eventEmitter.emit('yjs:sync-complete', { documentId: this.documentId });
      } finally {
        this.opening = null;
      }
    })();
    return this.opening;
  }

  private remote(seq: number, update: Uint8Array): void {
    if (this.destroyed || seq <= this.lastSeq) return; // already applied
    if (seq !== this.lastSeq + 1) { const _: Promise<void> = this.reopen(); return; }
    Y.applyUpdate(this.doc, update, RELAY_ORIGIN);
    this.lastSeq = seq;
  }

  private async push(update: Uint8Array): Promise<void> {
    try {
      const seq: number = await this.transport.send(update);
      if (seq === this.lastSeq + 1) this.lastSeq = seq;
      else if (seq > this.lastSeq) await this.reopen();
    } catch (error) {
      // The server kept its state without this edit. A Yjs edit cannot be taken back by applying
      // the server's state, so this copy now holds text the others do not: the user is told, and
      // re-opening the document shows what was kept.
      this.reportRefusal(error instanceof Error ? error.message : String(error));
    }
  }

  setLocalState(state: Record<string, unknown>): void { this.awareness.setLocalState(state); }
  setLocalStateField(field: string, value: unknown): void { this.awareness.setLocalStateField(field, value); }
  getStates(): ReturnType<Awareness['getStates']> { return this.awareness.getStates(); }

  destroy(): void {
    this.coalescer.flush();
    this.destroyed = true;
    this.doc.off('update', this.onLocal);
    this.unsubscribe();
    this.awareness.destroy();
  }
}
