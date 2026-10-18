/**
 * A stand-in EditorController, because this branch has only the controller's CONTRACT (the
 * worker-backed implementation is the editor wiring's, in progress on feat/citadel-docs-editor).
 * It is a real, if tiny, CRDT, so convergence is a property the test can lose: a grow-only set
 * of (client, clock, char) operations, text in (clock, client) order, deletes as tombstones
 * that only `collectGarbage` removes. Like cdoc-crdt, an update and a snapshot are different
 * kinds and `applyRemote` refuses a snapshot.
 */
import type { EditorCommand, EditorCommands, EditorController, EditorEventName, EditorEvents, EditorOpener, EditorOrigin, EditorPosition, EditorState, PeerView } from '../../../editor/controller';
import type { PeerOverlay, PeerPresence } from '../../../editor/peer-overlay';

type Op = readonly [client: string, clock: number, ch: string];
type Listener = (payload: never) => void;

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
type Wire = { k: string; ops?: Op[]; dels?: string[]; client?: string; caret?: number };
const decode = (bytes: Uint8Array): Wire => JSON.parse(new TextDecoder().decode(bytes)) as Wire;
const idOf = (op: Op): string => `${op[0]}:${op[1]}`;
const POSITION: EditorPosition = new Uint8Array([0]) as EditorPosition;

export class RecordingOverlay implements PeerOverlay {
  drawn: readonly PeerPresence[] = [];
  setPeers(peers: readonly PeerPresence[]): void { this.drawn = peers; }
  clear(): void { this.drawn = []; }
}

export class ReplicaDouble implements EditorController {
  readonly peers: RecordingOverlay = new RecordingOverlay();
  readonly commands: EditorCommands = new Proxy({}, {
    get: (_: object, name: string | symbol): ((args?: object) => Promise<EditorState>) =>
      (args?: object): Promise<EditorState> => this.execute({ name, ...args } as EditorCommand),
  }) as EditorCommands;
  disposed: boolean = false;
  private readonly ops: Map<string, Op> = new Map<string, Op>();
  private readonly deleted: Set<string> = new Set<string>();
  collections: number = 0;
  private clock: number = 0;
  private caret: number = 0;
  private readonly listeners: Map<EditorEventName, Set<Listener>> = new Map<EditorEventName, Set<Listener>>();

  constructor(readonly client: bigint, from: EditorOrigin) {
    if ('snapshot' in from) {
      const snapshot: ReturnType<typeof decode> = decode(from.snapshot);
      if (snapshot.k !== 'S') throw new Error('not a snapshot');
      this.merge(snapshot.ops ?? [], snapshot.dels ?? []);
    }
  }

  get text(): string {
    return [...this.ops.values()].filter((op: Op): boolean => !this.deleted.has(idOf(op))).sort((a: Op, b: Op): number => a[1] - b[1] || a[0].localeCompare(b[0])).map((op: Op): string => op[2]).join('');
  }

  get state(): EditorState {
    return { anchor: POSITION, head: POSITION, caret: null, selectionRects: [], caretPage: null, pageCount: 1, composing: false, caretFormatting: { known: false } };
  }

  /** Types `text` one character at a time, each one local update, as keystrokes do. */
  type(text: string): void {
    for (const ch of text) {
      this.clock = Math.max(this.clock, ...[...this.ops.values()].map((op: Op): number => op[1])) + 1;
      const op: Op = [this.client.toString(), this.clock, ch];
      this.merge([op], []);
      this.caret += 1;
      this.emit('change', { update: encode({ k: 'U', ops: [op] }), dirtyPages: [0] });
      this.emit('pages', { pageCount: 1, dirtyPages: [0] });
      this.emit('selection', this.state);
    }
  }

  /** Deletes every visible character: one update of tombstones. */
  clear(): void {
    const dels: string[] = [...this.ops.values()].map(idOf).filter((id: string): boolean => !this.deleted.has(id));
    this.merge([], dels);
    this.caret = 0;
    this.emit('change', { update: encode({ k: 'U', ops: [], dels }), dirtyPages: [0] });
    this.emit('pages', { pageCount: 1, dirtyPages: [0] });
  }

  moveCaret(to: number): void {
    this.caret = to;
    this.emit('selection', this.state);
  }

  execute(command: EditorCommand): Promise<EditorState> {
    if (command.name === 'insertText') this.type(command.text);
    return Promise.resolve(this.state);
  }

  hitTest(): Promise<EditorPosition> {
    return Promise.resolve(POSITION);
  }

  applyRemote(update: Uint8Array): Promise<EditorState> {
    const decoded: ReturnType<typeof decode> = decode(update);
    if (decoded.k !== 'U') return Promise.reject(new Error('applyRemote takes an update, not a snapshot'));
    this.merge(decoded.ops ?? [], decoded.dels ?? []);
    this.emit('pages', { pageCount: 1, dirtyPages: [0] });
    this.emit('selection', this.state);
    return Promise.resolve(this.state);
  }

  snapshot(): Promise<Uint8Array> {
    return Promise.resolve(encode({ k: 'S', ops: [...this.ops.values()], dels: [...this.deleted] }));
  }

  collectGarbage(): Promise<void> {
    for (const id of this.deleted) this.ops.delete(id);
    this.deleted.clear();
    this.collections += 1;
    return Promise.resolve();
  }

  awareness(): Promise<Uint8Array> {
    return Promise.resolve(encode({ k: 'A', client: this.client.toString(), caret: this.caret }));
  }

  /** The peer's caret, clamped to THIS replica's text: a repaint here can move it. */
  peerView(record: Uint8Array): Promise<PeerView> {
    const decoded: ReturnType<typeof decode> = decode(record);
    if (decoded.k !== 'A' || decoded.client === undefined) return Promise.reject(new Error('not an awareness record'));
    const x: number = Math.min(decoded.caret ?? 0, this.text.length) * 100;
    return Promise.resolve({ client: BigInt(decoded.client), caret: { page: 0, rect: { x, y: 0, width: 0, height: 1200 } }, selectionRects: [] } as PeerView);
  }

  /** Not collaboration's concern: the stand-in has no image store. */
  addImage(): Promise<string> {
    return Promise.reject(new Error('the replica double stores no images'));
  }

  focus(): void {}

  on<E extends EditorEventName>(event: E, listener: (payload: EditorEvents[E]) => void): () => void {
    const set: Set<Listener> = this.listeners.get(event) ?? new Set<Listener>();
    this.listeners.set(event, set);
    set.add(listener as Listener);
    return (): void => { set.delete(listener as Listener); };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private merge(ops: readonly Op[], dels: readonly string[]): void {
    for (const op of ops) this.ops.set(idOf(op), op);
    for (const id of dels) this.deleted.add(id);
  }

  private emit<E extends EditorEventName>(event: E, payload: EditorEvents[E]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) (listener as (p: EditorEvents[E]) => void)(payload);
  }
}

/** An opener whose every replica has a client id of its own, as EditorOpener requires. */
export function replicaOpener(firstClient: bigint): { readonly open: EditorOpener; readonly opened: ReplicaDouble[]; readonly sources: EditorOrigin[] } {
  const opened: ReplicaDouble[] = [];
  const sources: EditorOrigin[] = [];
  const open: EditorOpener = (from: EditorOrigin): Promise<EditorController> => {
    const replica: ReplicaDouble = new ReplicaDouble(firstClient + BigInt(opened.length), from);
    opened.push(replica);
    sources.push(from);
    return Promise.resolve(replica);
  };
  return { open, opened, sources };
}
