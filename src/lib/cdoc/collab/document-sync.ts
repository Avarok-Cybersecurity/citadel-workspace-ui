/**
 * One replica kept in step with a node's update log: pulled in order on open and after every
 * gap, local updates appended, peers' updates applied, a snapshot stored when due.
 *
 * Every step runs on the session's SerialQueue, so the cursor, the outbox and the editor are
 * only ever touched by one step at a time.
 */
import type { DocumentsRequest, DocumentsResponse, DocumentSnapshot } from 'citadel-workspace-client-ts';
import type { EditorController, EditorOrigin } from '../editor/controller';
import { LogCursor } from './log-cursor';
import { Outbox, type PendingUpdate } from './outbox';
import type { CachedDocument, DocumentSessionConfig, DocumentSessionPorts } from './ports';
import type { DocumentSessionProblem } from './session-errors';
import { haltsWriting } from './session-errors';
import { fromWire, toWire } from './wire-bytes';
import { SnapshotPolicy, type SnapshotHost } from './snapshot-policy';

type Updates = Extract<DocumentsResponse, { Updates: unknown }>['Updates'];
type Updated = Extract<DocumentsResponse, { DocumentUpdated: unknown }>['DocumentUpdated'];
type Appended = Extract<DocumentsResponse, { Appended: unknown }>['Appended'];

export interface SyncHost {
  report(problem: DocumentSessionProblem): void;
  /** A replica was opened; `previous` (null on the first) is disposed after this returns. */
  adopt(editor: EditorController, previous: EditorController | null): void;
  linkUp(): boolean;
  alone(): boolean;
}

export class DocumentSync {
  private editorNow: EditorController | null = null;
  private cursor: LogCursor = new LogCursor(0n);
  private readonly outbox: Outbox;
  private readonly snapshots: SnapshotPolicy;
  private cancelPullTimer: (() => void) | null = null;
  private writable: boolean = true;
  private readable: boolean = true;

  constructor(private readonly config: DocumentSessionConfig, private readonly ports: DocumentSessionPorts, private readonly host: SyncHost) {
    this.outbox = new Outbox(config.clientSeqBase);
    const snapshotHost: SnapshotHost = { report: host.report, linkUp: host.linkUp, alone: host.alone, writable: (): boolean => this.writable };
    this.snapshots = new SnapshotPolicy(config, ports, snapshotHost, (request: DocumentsRequest, name: string): Promise<void> => this.send(request, name));
  }

  get editor(): EditorController | null {
    return this.editorNow;
  }

  get seq(): bigint {
    return this.cursor.seq;
  }

  get caughtUp(): boolean {
    return this.cancelPullTimer === null && this.outbox.empty && this.cursor.contiguous;
  }

  async start(): Promise<void> {
    const cached: CachedDocument | null = await this.loadCached();
    if (cached && this.versionOk(cached.docVersion, 'the cached snapshot')) {
      await this.open({ kind: 'snapshot', snapshot: cached.snapshot }, cached.seq);
    }
    await this.pull();
  }

  private async loadCached(): Promise<CachedDocument | null> {
    if (!this.ports.cache) return null;
    try {
      return await this.ports.cache.load(this.config.nodeId);
    } catch (cause: unknown) {
      this.host.report({ kind: 'cacheFailed', operation: 'read', cause });
      return null;
    }
  }

  async onLinkUp(): Promise<void> {
    if (this.writable) for (const entry of this.outbox.all()) await this.sendAppend(entry);
    await this.pull();
  }

  onLinkDown(): void {
    this.stopPullTimer();
    this.snapshots.abandon();
  }

  async local(update: Uint8Array): Promise<void> {
    if (update.byteLength > this.config.limits.maxUpdateBytes) {
      this.writable = false;
      this.host.report({ kind: 'tooLarge', what: 'update', sizeBytes: update.byteLength, maxBytes: this.config.limits.maxUpdateBytes });
      return;
    }
    const entry: PendingUpdate = this.outbox.push(update.slice());
    if (this.writable && this.host.linkUp()) await this.sendAppend(entry);
    this.snapshots.countLocal();
  }

  async onResponse(response: DocumentsResponse): Promise<void> {
    if ('Updates' in response) await this.onUpdates(response.Updates);
    else if ('DocumentUpdated' in response) await this.onUpdated(response.DocumentUpdated);
    else if ('Appended' in response) await this.onAppended(response.Appended);
    else if ('SnapshotStored' in response) await this.snapshots.stored(response.SnapshotStored.upto_seq);
    else if ('Refused' in response) this.onRefused(response.Refused);
  }

  /** A protocol `Error` naming a permission; only ours when we have that kind of request out. */
  onPermissionDenied(message: string): void {
    const writeDenied: boolean = message.includes('EditMdx') && (!this.outbox.empty || this.snapshots.inFlight);
    const readDenied: boolean = message.includes('ViewContent') && this.cancelPullTimer !== null;
    if (!writeDenied && !readDenied) return;
    if (writeDenied) this.writable = false;
    if (readDenied) { this.readable = false; this.stopPullTimer(); }
    this.host.report({ kind: 'permissionDenied', message });
  }

  stop(): void {
    this.stopPullTimer();
  }

  private async onUpdates(page: Updates): Promise<void> {
    this.stopPullTimer();
    if (page.snapshot && page.snapshot.upto_seq > this.cursor.seq && !(await this.adoptSnapshot(page.snapshot))) return;
    if (!this.editorNow) await this.open({ kind: 'blank' }, this.cursor.seq);
    let gap: boolean = false;
    for (const entry of page.updates) {
      if (!this.versionOk(entry.doc_version, `update ${entry.seq}`)) return;
      const placement: ReturnType<LogCursor['place']> = this.cursor.place(entry.seq);
      if (placement === 'gap') { gap = true; break; }
      if (placement === 'next') await this.applyNext(entry.seq, entry.update);
    }
    if (gap || page.has_more || page.latest_seq > this.cursor.seq) await this.pull();
    else await this.snapshots.consider(this.editorNow, this.cursor.seq, this.caughtUp);
  }

  private async onUpdated(pushed: Updated): Promise<void> {
    if (!this.editorNow || !this.versionOk(pushed.doc_version, `update ${pushed.seq}`)) return;
    const placement: ReturnType<LogCursor['place']> = this.cursor.place(pushed.seq);
    if (placement === 'next') await this.applyNext(pushed.seq, pushed.update);
    else if (placement === 'gap') await this.pull();
  }

  private async onAppended(answer: Appended): Promise<void> {
    const ours: PendingUpdate | null = this.outbox.settle(answer.client_seq);
    // Not ours: another tab of this account wrote it, and the server sends an author's own
    // session no DocumentUpdated, so the bytes are only to be had by pulling.
    if (!ours) {
      if (this.cursor.place(answer.seq) !== 'old') await this.pull();
      return;
    }
    if (!this.cursor.own(answer.seq)) await this.pull();
    if (answer.compaction) this.snapshots.requested();
    await this.snapshots.consider(this.editorNow, this.cursor.seq, this.caughtUp);
  }

  private onRefused(refusal: Extract<DocumentsResponse, { Refused: unknown }>['Refused']): void {
    if (haltsWriting(refusal)) this.writable = false;
    if (typeof refusal !== 'string' && ('SnapshotBehind' in refusal || 'SnapshotAhead' in refusal || 'SnapshotTooLarge' in refusal)) this.snapshots.abandon();
    this.host.report({ kind: 'refused', refusal });
  }

  private async applyNext(seq: bigint, update: readonly number[]): Promise<void> {
    const editor: EditorController | null = this.editorNow;
    if (!editor) return;
    try {
      await editor.applyRemote(fromWire(update));
    } catch (cause: unknown) {
      // Reported, then stepped over: holding the cursor here would stall this replica on one
      // peer's unreadable update for good, and pulling again would fetch the same bytes.
      this.host.report({ kind: 'editorFailed', operation: `apply update ${seq}`, cause });
    }
    this.cursor.advance(seq);
  }

  /** Opens or re-opens from the snapshot; false when it cannot be read. */
  private async adoptSnapshot(snapshot: DocumentSnapshot): Promise<boolean> {
    if (!this.versionOk(snapshot.doc_version, `the snapshot to ${snapshot.upto_seq}`)) return false;
    const previous: EditorController | null = this.editorNow;
    await this.open({ kind: 'snapshot', snapshot: fromWire(snapshot.bytes) }, snapshot.upto_seq);
    // A re-open lost what the old replica held past the snapshot: our unacknowledged edits
    // go into the new one (the outbox still holds them), and the log's later updates follow.
    const reopened: EditorController | null = previous ? this.editorNow : null;
    if (!reopened) return true;
    try {
      for (const entry of this.outbox.all()) await reopened.applyRemote(entry.update.slice());
    } catch (cause: unknown) {
      this.host.report({ kind: 'editorFailed', operation: 'carry unacknowledged edits into the re-opened replica', cause });
    }
    return true;
  }

  private async open(from: EditorOrigin, seq: bigint): Promise<void> {
    const previous: EditorController | null = this.editorNow;
    const editor: EditorController = await this.ports.openEditor(from);
    this.editorNow = editor;
    this.cursor = new LogCursor(seq);
    this.host.adopt(editor, previous);
    if (previous) previous.dispose();
  }

  private async pull(): Promise<void> {
    if (!this.readable || !this.host.linkUp()) return;
    this.stopPullTimer();
    this.cancelPullTimer = this.ports.clock.after(this.config.pullTimeoutMs, (): void => { this.cancelPullTimer = null; void this.pull(); });
    await this.send({ Pull: { node_id: this.config.nodeId, since_seq: this.cursor.seq } }, 'Pull');
  }

  private stopPullTimer(): void {
    if (this.cancelPullTimer) this.cancelPullTimer();
    this.cancelPullTimer = null;
  }

  private sendAppend(entry: PendingUpdate): Promise<void> {
    return this.send({ Append: { node_id: this.config.nodeId, doc_version: this.config.docVersion, update: toWire(entry.update), client_seq: entry.clientSeq } }, 'Append');
  }

  private async send(request: DocumentsRequest, name: string): Promise<void> {
    try {
      await this.ports.transport.send(request);
    } catch (cause: unknown) {
      this.host.report({ kind: 'sendFailed', request: name, cause });
    }
  }

  private versionOk(received: number, where: string): boolean {
    if (received === this.config.docVersion) return true;
    this.host.report({ kind: 'docVersionMismatch', expected: this.config.docVersion, received, where });
    return false;
  }
}
