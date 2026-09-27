/**
 * Every member's copy of a peer group's live documents.
 *
 * A peer group has no server to keep a document, so each member keeps one: whether or not it
 * is open, every update a member receives is applied to this member's copy and stored, so the
 * document outlives any one person closing it. A member opening it asks the others for what it
 * lacks (a `sync` with its state vector), and any member holding more answers with an `update`.
 *
 * - Updates from this member (the editor, through mesh-provider) are coalesced and sent.
 * - Updates from the others are applied with KEEPER_ORIGIN, which is never sent back.
 * - Bounded as the office relay is: MAX_DOCS_PER_GROUP documents, MAX_DOC_BYTES each. A
 *   document past its size stops being sent and stored, and says so.
 *
 * No I/O here: storage and sending are injected (group-doc-keeper-instance.ts wires the real
 * ones), so the rules are tested against real Yjs without a network or a database.
 */
import * as Y from 'yjs';
import { UpdateCoalescer } from '@/lib/yjs-p2p-provider/update-coalescer';
import { MAX_LIVE_DOC_BYTES, type GroupLiveDocBody } from './group-doc-codec';

export const MAX_DOCS_PER_GROUP: number = 32;
export const MAX_DOC_BYTES: number = 1024 * 1024;
/** How long after an edit the document is written, so typing is not one write per key. */
export const KEEPER_SAVE_DELAY_MS: number = 500;
/** Marks updates this keeper applied from another member, so they are not sent back. */
export const KEEPER_ORIGIN: symbol = Symbol('group-doc-keeper');

export interface KeeperStorage {
  load(groupId: string, docId: string): Promise<Uint8Array | undefined>;
  save(groupId: string, docId: string, state: Uint8Array): Promise<void>;
}
export type KeeperSend = (groupId: string, body: GroupLiveDocBody) => Promise<void>;
/** Why a document could not be kept or shared in full; the user is told. */
export type KeeperReport = (groupId: string, docId: string, reason: string) => void;

interface Kept { doc: Y.Doc; full: boolean }

/** An update carrying nothing: what `encodeStateAsUpdate` returns when there is nothing to send. */
const isEmptyUpdate = (update: Uint8Array): boolean => update.byteLength <= 2;

export class GroupDocKeeper {
  private readonly kept: Map<string, Promise<Kept>> = new Map();

  constructor(private readonly storage: KeeperStorage, private readonly send: KeeperSend, private readonly report: KeeperReport) {}

  /** This member's copy of a document, loaded from storage the first time it is asked for. */
  async doc(groupId: string, docId: string): Promise<Y.Doc> {
    return (await this.entry(groupId, docId)).doc;
  }

  private entry(groupId: string, docId: string): Promise<Kept> {
    const key: string = `${groupId} ${docId}`;
    let entry: Promise<Kept> | undefined = this.kept.get(key);
    if (!entry) {
      entry = this.open(groupId, docId);
      this.kept.set(key, entry);
    }
    return entry;
  }

  private docsIn(groupId: string): number {
    let n: number = 0;
    for (const key of this.kept.keys()) if (key.startsWith(`${groupId} `)) n += 1;
    return n;
  }

  private async open(groupId: string, docId: string): Promise<Kept> {
    const doc: Y.Doc = new Y.Doc();
    const stored: Uint8Array | undefined = await this.storage.load(groupId, docId);
    if (stored && stored.byteLength > 0) Y.applyUpdate(doc, stored, KEEPER_ORIGIN);
    const kept: Kept = { doc, full: false };
    const coalescer: UpdateCoalescer = new UpdateCoalescer((update: Uint8Array) => { this.share(groupId, docId, kept, update); });
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (kept.full) return;
      const state: Uint8Array = Y.encodeStateAsUpdate(doc);
      if (state.byteLength > MAX_DOC_BYTES) {
        kept.full = true;
        this.report(groupId, docId, 'this live document has reached its size limit; later changes are not saved or shared');
        return;
      }
      if (origin !== KEEPER_ORIGIN) coalescer.add(update);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        this.storage.save(groupId, docId, Y.encodeStateAsUpdate(doc)).catch((e: unknown) => {
          this.report(groupId, docId, `this copy could not be saved: ${e instanceof Error ? e.message : String(e)}`);
        });
      }, KEEPER_SAVE_DELAY_MS);
    });
    return kept;
  }

  private share(groupId: string, docId: string, kept: Kept, update: Uint8Array): void {
    if (update.byteLength > MAX_LIVE_DOC_BYTES) {
      this.report(groupId, docId, 'that change is too large to send at once');
      return;
    }
    this.send(groupId, { doc_id: docId, kind: 'update', data: update }).catch((e: unknown) => {
      this.report(groupId, docId, `a change could not be sent: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  /** Another member's update or sync request for a document of this group. */
  async receive(groupId: string, body: GroupLiveDocBody): Promise<void> {
    const known: boolean = this.kept.has(`${groupId} ${body.doc_id}`);
    if (!known && this.docsIn(groupId) >= MAX_DOCS_PER_GROUP) return;
    const kept: Kept = await this.entry(groupId, body.doc_id);
    if (body.kind === 'update') {
      try {
        Y.applyUpdate(kept.doc, body.data, KEEPER_ORIGIN);
      } catch {
        // Bytes that are not a Yjs update: a peer on another build, or a bad one. Not applied.
      }
      return;
    }
    let missing: Uint8Array;
    try {
      missing = Y.encodeStateAsUpdate(kept.doc, body.data);
    } catch {
      return; // not a state vector
    }
    if (!isEmptyUpdate(missing)) this.share(groupId, body.doc_id, kept, missing);
  }

  /** Asks the other members for whatever of a document this member lacks. */
  async requestSync(groupId: string, docId: string): Promise<void> {
    const doc: Y.Doc = await this.doc(groupId, docId);
    await this.send(groupId, { doc_id: docId, kind: 'sync', data: Y.encodeStateVector(doc) });
  }
}
