/**
 * What the rest of the UI holds to drive a Citadel Docs editor: the ribbons (Home, Insert,
 * Layout) call commands by name, read the selection and caret, and listen for changes; the
 * collaboration wiring relays updates and awareness. The editor itself (cdoc-edit's
 * EditorHandle) runs in the cdoc worker; every command becomes one request record of
 * citadel-docs docs/edit-commands.md (version 2), whose opcode COMMAND_OPCODES names.
 *
 * EditorCommand is the single source: `commands` and `execute` are both derived from it, so a
 * command added there is a type error until it has an opcode and both surfaces carry it.
 */
import type { CommentValue, PageSetupPatch, ParagraphPatch, Pt100, RunPropertiesPatch } from './model-values';
import type { CaretFormatting } from './caret-formatting';
import type { ExportFormat, ImportFormat, ImportReport } from './file-formats';
import type { PeerOverlay } from './peer-overlay';

/**
 * A CRDT position (`client:uv clock:uv`), opaque: copied out of a result or a hit test and
 * back into a request, never read. Survives local and remote edits.
 */
export type EditorPosition = Uint8Array & { readonly __editorPosition: unique symbol };

/** A rectangle in page space, Pt100, top-left origin, y down. */
export interface PtRect {
  readonly x: Pt100;
  readonly y: Pt100;
  readonly width: Pt100;
  readonly height: Pt100;
}

/** A rectangle on a zero-based page. */
export interface PageRect {
  readonly page: number;
  readonly rect: PtRect;
}

export type DeleteUnit = 'char' | 'word';
export type BreakKind = 'line' | 'page' | 'column';
export type Mark = 'bold' | 'italic' | 'underline' | 'strike' | 'subscript' | 'superscript';
export type CaretGranularity = 'char' | 'word' | 'lineBoundary' | 'line' | 'paragraph' | 'document';

export type EditorCommand =
  | { readonly name: 'insertText'; readonly text: string }
  | { readonly name: 'deleteBackward'; readonly unit: DeleteUnit }
  | { readonly name: 'deleteForward'; readonly unit: DeleteUnit }
  | { readonly name: 'splitParagraph' }
  | { readonly name: 'insertBreak'; readonly kind: BreakKind }
  | { readonly name: 'insertTab' }
  | { readonly name: 'toggleMark'; readonly mark: Mark }
  | { readonly name: 'setRunProperty'; readonly patch: RunPropertiesPatch }
  | { readonly name: 'setParagraphProperty'; readonly patch: ParagraphPatch }
  | { readonly name: 'setParagraphStyle'; readonly style: string }
  | { readonly name: 'setNumbering'; readonly numId: number; readonly level: number }
  | { readonly name: 'clearNumbering' }
  | { readonly name: 'indent' }
  | { readonly name: 'outdent' }
  /** Page setup of every section from the anchor's to the head's. */
  | { readonly name: 'setSectionProperty'; readonly patch: PageSetupPatch }
  | { readonly name: 'insertTable'; readonly rows: number; readonly cols: number }
  | { readonly name: 'insertRowAbove' }
  | { readonly name: 'insertRowBelow' }
  | { readonly name: 'insertColumnLeft' }
  | { readonly name: 'insertColumnRight' }
  | { readonly name: 'deleteRow' }
  | { readonly name: 'deleteColumn' }
  | { readonly name: 'deleteTable' }
  | { readonly name: 'mergeCells' }
  | { readonly name: 'insertImage'; readonly contentId: string; readonly width: Pt100; readonly height: Pt100 }
  | { readonly name: 'insertFootnote'; readonly id: number }
  | { readonly name: 'insertLink'; readonly href: string }
  | { readonly name: 'removeLink' }
  | { readonly name: 'insertComment'; readonly comment: CommentValue }
  | { readonly name: 'replace'; readonly from: EditorPosition; readonly to: EditorPosition; readonly text: string }
  | { readonly name: 'selectAll' }
  | { readonly name: 'setSelection'; readonly anchor: EditorPosition; readonly head: EditorPosition }
  | { readonly name: 'undo' }
  | { readonly name: 'redo' }
  /** Ends the current undo step: on blur, after a typing pause, before a paste. */
  | { readonly name: 'breakUndoGroup' }
  | { readonly name: 'moveCaret'; readonly granularity: CaretGranularity; readonly forward: boolean; readonly extend: boolean }
  | { readonly name: 'selectWord'; readonly at: EditorPosition }
  | { readonly name: 'selectParagraph'; readonly at: EditorPosition }
  | { readonly name: 'compositionStart' }
  /** `caret` counts characters into `text`. */
  | { readonly name: 'compositionUpdate'; readonly text: string; readonly caret: number }
  | { readonly name: 'compositionCommit' }
  | { readonly name: 'compositionCancel' };

export type EditorCommandName = EditorCommand['name'];
export type CommandOf<N extends EditorCommandName> = Extract<EditorCommand, { name: N }>;

/** Each command's request opcode, exactly docs/edit-commands.md's table. */
export const COMMAND_OPCODES: { readonly [N in EditorCommandName]: number } = {
  insertText: 0x01,
  deleteBackward: 0x02,
  deleteForward: 0x03,
  splitParagraph: 0x04,
  insertBreak: 0x05,
  insertTab: 0x06,
  toggleMark: 0x07,
  setRunProperty: 0x08,
  setParagraphProperty: 0x09,
  setParagraphStyle: 0x0a,
  setNumbering: 0x0b,
  clearNumbering: 0x0c,
  indent: 0x0d,
  outdent: 0x0e,
  setSectionProperty: 0x0f,
  insertTable: 0x10,
  insertRowAbove: 0x11,
  insertRowBelow: 0x12,
  insertColumnLeft: 0x13,
  insertColumnRight: 0x14,
  deleteRow: 0x15,
  deleteColumn: 0x16,
  deleteTable: 0x17,
  mergeCells: 0x18,
  insertImage: 0x20,
  insertFootnote: 0x21,
  insertLink: 0x22,
  removeLink: 0x23,
  insertComment: 0x24,
  replace: 0x30,
  selectAll: 0x31,
  setSelection: 0x32,
  undo: 0x40,
  redo: 0x41,
  breakUndoGroup: 0x42,
  moveCaret: 0x43,
  selectWord: 0x44,
  selectParagraph: 0x45,
  compositionStart: 0x50,
  compositionUpdate: 0x51,
  compositionCommit: 0x52,
  compositionCancel: 0x53,
};

export type { CaretFormatting } from './caret-formatting';

export interface EditorState {
  readonly anchor: EditorPosition;
  readonly head: EditorPosition;
  /** Zero width, line height; null when the result record reports no caret. */
  readonly caret: PageRect | null;
  /** One rect per selected line, empty for a collapsed selection. */
  readonly selectionRects: readonly PageRect[];
  /** The zero-based page the caret is on, or null with no caret. */
  readonly caretPage: number | null;
  readonly pageCount: number;
  /** An IME composition is open; its provisional text is drawn at the caret. */
  readonly composing: boolean;
  readonly caretFormatting: CaretFormatting;
}

/** A peer's caret and selection mapped onto this replica's pages. */
export interface PeerView {
  readonly client: bigint;
  readonly caret: PageRect | null;
  readonly selectionRects: readonly PageRect[];
}

export interface EditorEvents {
  /** A local command changed the document; `update` is the CRDT update to relay to peers. */
  change: { readonly update: Uint8Array; readonly dirtyPages: readonly number[] };
  /** Selection, caret or composition moved (after any command, local or remote). */
  selection: EditorState;
  /** Pages were repainted or the page count changed (local or remote). */
  pages: { readonly pageCount: number; readonly dirtyPages: readonly number[] };
}

export type EditorEventName = keyof EditorEvents;

type ArgsOf<N extends EditorCommandName> = Omit<CommandOf<N>, 'name'>;

/** One method per command, derived from EditorCommand: `commands.toggleMark({ mark: 'bold' })`. */
export type EditorCommands = {
  readonly [N in EditorCommandName]: keyof ArgsOf<N> extends never
    ? () => Promise<EditorState>
    : (args: ArgsOf<N>) => Promise<EditorState>;
};

/** What a replica opens from: a new blank document, a CRDT snapshot, or a file's bytes. */
export type EditorOrigin =
  | { readonly kind: 'blank' }
  | { readonly kind: 'snapshot'; readonly snapshot: Uint8Array }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array; readonly format: ImportFormat };

/** A stored image (the "CDI" record): its content id is `sha256-` and the file's hex digest. */
export interface AddedImage {
  readonly contentId: string;
  readonly kind: 'png' | 'jpeg';
  /** Pixels; the display size is the caller's, sent with insertImage in Pt100. */
  readonly width: number;
  readonly height: number;
}

/**
 * The only way to open a replica. Each call is a NEW replica with its own random 64-bit CRDT
 * client id (two tabs of one account are two replicas), never a default and never the CID.
 */
export type EditorOpener = (from: EditorOrigin) => Promise<EditorController>;

export interface EditorController {
  readonly state: EditorState;
  readonly commands: EditorCommands;
  /** Other people's carets and selections over the pages (peer-overlay.ts). */
  readonly peers: PeerOverlay;
  /**
   * Runs one command; resolves with the state after it. Rejects (and changes nothing) when the
   * command does not apply where the selection is, e.g. mergeCells outside a table.
   */
  execute(command: EditorCommand): Promise<EditorState>;
  /** The position nearest `(x, y)` on zero-based `page`, in Pt100 page space. */
  hitTest(page: number, x: Pt100, y: Pt100): Promise<EditorPosition>;
  /** Applies a peer's CRDT update; emits `pages` and `selection`, never `change`. */
  applyRemote(update: Uint8Array): Promise<EditorState>;
  /** The full CRDT snapshot, to persist or to seed a joining peer. */
  snapshot(): Promise<Uint8Array>;
  /** This replica's awareness record, to relay as is. */
  awareness(): Promise<Uint8Array>;
  /** A peer's awareness record as rectangles on this replica's pages. */
  peerView(record: Uint8Array): Promise<PeerView>;
  /** This replica's state vector, for a peer to compute what this replica lacks. */
  stateVector(): Promise<Uint8Array>;
  /** The update a peer at state vector `sv` lacks, to send it. */
  encodeDiff(sv: Uint8Array): Promise<Uint8Array>;
  /**
   * Collects this replica's tombstones (cdoc-crdt Doc::gc) that every peer in `known` (each
   * peer's acknowledged stateVector) has seen; resolves with what was removed. Valid only when
   * every peer holds everything this replica holds; the collaboration session decides when.
   * The undo history ends.
   */
  collectGarbage(known: readonly Uint8Array[]): Promise<{ readonly units: number; readonly deletes: number }>;
  /**
   * Holds an image file (PNG or JPEG, read from its signature) of at most `maxBytes` bytes, and
   * resolves with its content id and pixel size; `insertImage` then places it. Store the bytes
   * in the workspace's content store under that id before relaying the insertImage update.
   */
  addImage(bytes: Uint8Array, maxBytes: number): Promise<AddedImage>;
  /** The live document as a file. */
  exportAs(format: ExportFormat): Promise<Uint8Array>;
  /** What the import lost, for a replica opened from file bytes; null otherwise. */
  readonly importReport: ImportReport | null;
  /** Returns keyboard focus to the editor, e.g. after a ribbon button took it. */
  focus(): void;
  on<E extends EditorEventName>(event: E, listener: (payload: EditorEvents[E]) => void): () => void;
  dispose(): void;
}
