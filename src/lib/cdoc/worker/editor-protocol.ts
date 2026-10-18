/**
 * The editor's request kinds in the cdoc worker protocol (protocol.ts), one per EditorHandle
 * call. Records are citadel-docs docs/edit-commands.md v1 bytes, each a Uint8Array owning its
 * buffer and moved as a Transferable; the worker never decodes a request record and the page
 * decodes every result. Part of CdocRequestBody and CdocResults (protocol.ts).
 */
import type { EditorOrigin } from '../editor/controller';

export type EditorRequestBody =
  /** Opens the editor as replica `client` over a CRDT snapshot, or a blank document. */
  | { readonly kind: 'editorOpen'; readonly client: bigint; readonly from: EditorOrigin }
  /** One request record (opcode + fields). */
  | { readonly kind: 'apply'; readonly record: Uint8Array }
  | { readonly kind: 'applyRemote'; readonly update: Uint8Array }
  /** Pt100 page space, zero-based page. */
  | { readonly kind: 'hitTest'; readonly page: number; readonly x: number; readonly y: number }
  | { readonly kind: 'snapshot' }
  | { readonly kind: 'awareness' }
  | { readonly kind: 'peerView'; readonly record: Uint8Array }
  /** Every page's size, after an edit changed the page count. */
  | { readonly kind: 'pageSizes' }
  /** Collects tombstones (EditorController.collectGarbage). */
  | { readonly kind: 'gc' }
  /** Drops the worker painter's copy of `pages` (an edit changed them) before they repaint. */
  | { readonly kind: 'invalidatePages'; readonly pages: readonly number[] };

export interface EditorResults {
  /**
   * EditorHandle.open returns no result record, so the opening state is its own awareness
   * ("CDA": anchor, head) and that record's peer view ("CDP": caret, selection rects).
   */
  editorOpen: { readonly pageSizes: Int32Array; readonly awareness: Uint8Array; readonly view: Uint8Array };
  /** The "CDE" result record. */
  apply: { readonly result: Uint8Array };
  applyRemote: { readonly result: Uint8Array };
  /** A position record. */
  hitTest: { readonly position: Uint8Array };
  snapshot: { readonly snapshot: Uint8Array };
  /** A "CDA" awareness record. */
  awareness: { readonly record: Uint8Array };
  /** A "CDP" peer-view record. */
  peerView: { readonly record: Uint8Array };
  /** Width, height pairs in Pt100, in page order. */
  pageSizes: { readonly pageSizes: Int32Array };
  invalidatePages: { readonly pages: readonly number[] };
  gc: { readonly collected: true };
}

export type EditorKind = EditorRequestBody['kind'];

export const EDITOR_KINDS: readonly EditorKind[] = ['editorOpen', 'apply', 'applyRemote', 'hitTest', 'snapshot', 'awareness', 'peerView', 'pageSizes', 'invalidatePages', 'gc'];
