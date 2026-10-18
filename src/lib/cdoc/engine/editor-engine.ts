/**
 * One editing session in the worker: cdoc-edit's EditorHandle over sealed faces. Records in,
 * records out (docs/edit-commands.md v1); this class decodes none of them, it only checks the
 * arguments the handle would otherwise read as something else. Every returned array is a copy
 * out of wasm memory, so it owns its buffer and can be transferred.
 */
import type { CdocWasm, EditorHandle, EditorSealedFonts } from './cdoc-wasm-api';
import type { EditorOrigin } from '../editor/controller';
import type { ExportFormat } from '../editor/file-formats';

export type { EditorOrigin } from '../editor/controller';

function checkPage(page: number, pageCount: number): void {
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) throw new Error(`page ${page} is not in the document (${pageCount} pages)`);
}

function checkPt(v: number, what: string): void {
  if (!Number.isInteger(v) || v < -0x8000_0000 || v > 0x7fff_ffff) throw new Error(`${what} ${v} is not an i32 Pt100`);
}

export class EditorEngine {
  private constructor(private readonly handle: EditorHandle) {}

  static open(wasm: CdocWasm, fonts: EditorSealedFonts, client: bigint, origin: EditorOrigin): EditorEngine {
    if (client < 0n || client > 0xffff_ffff_ffff_ffffn) throw new Error(`client ${client} is not a u64`);
    switch (origin.kind) {
      case 'blank': return new EditorEngine(wasm.EditorHandle.blank(client, fonts));
      case 'snapshot': return new EditorEngine(wasm.EditorHandle.open(origin.snapshot, client, fonts));
      case 'bytes':
        // cdoc-edit-io adds the engine call (EditorHandle.fromDocument); until then, refused by name.
        throw new Error(`this cdoc-wasm build cannot open ${origin.format} files (EditorHandle.fromDocument is missing)`);
    }
  }

  get pageCount(): number {
    return this.handle.pageCount();
  }

  request(record: Uint8Array): Uint8Array {
    return this.handle.request(record);
  }

  applyRemote(update: Uint8Array): Uint8Array {
    return this.handle.applyRemote(update);
  }

  /** The display list of exactly `pages`. */
  paint(pages: readonly number[]): Uint8Array {
    const count: number = this.pageCount;
    for (const page of pages) checkPage(page, count);
    return this.handle.paint(Uint32Array.from(pages));
  }

  hitTest(page: number, x: number, y: number): Uint8Array {
    checkPage(page, this.pageCount);
    checkPt(x, 'x');
    checkPt(y, 'y');
    return this.handle.hitTest(page, x, y);
  }

  /** Width, height pairs in Pt100, in page order. */
  pageSizes(): Int32Array {
    const count: number = this.pageCount;
    const sizes: Int32Array = new Int32Array(count * 2);
    for (let page: number = 0; page < count; page++) {
      const size: Int32Array | undefined = this.handle.pageSize(page);
      if (size === undefined || size.length !== 2) throw new Error(`page ${page} has no size`);
      sizes.set(size, page * 2);
    }
    return sizes;
  }

  snapshot(): Uint8Array {
    return this.handle.snapshot();
  }

  awareness(): Uint8Array {
    return this.handle.awareness();
  }

  peerView(record: Uint8Array): Uint8Array {
    return this.handle.peerView(record);
  }

  stateVector(): Uint8Array {
    return this.handle.stateVector();
  }

  encodeDiff(sv: Uint8Array): Uint8Array {
    return this.handle.encodeDiff(sv);
  }

  /**
   * cdoc-crdt's Doc::encode_diff_chunked: the diff as causally ordered updates of at most
   * `maxBytes` each. The binding comes with the crdt sync work; until it is vendored this fails
   * by name rather than sending one unbounded update.
   */
  encodeDiffChunked(sv: Uint8Array | null, maxBytes: number): Uint8Array[] {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 0xffff_ffff) throw new Error(`maxBytes ${maxBytes} is not a positive u32`);
    const chunkFn: unknown = (this.handle as unknown as { readonly encodeDiffChunked?: unknown }).encodeDiffChunked;
    if (typeof chunkFn !== 'function') throw new Error('this cdoc-wasm build cannot chunk a diff (EditorHandle.encodeDiffChunked is missing)');
    const updates: unknown = (chunkFn as (sv: Uint8Array | null, maxBytes: number) => unknown).call(this.handle, sv, maxBytes);
    if (!Array.isArray(updates) || !updates.every((u: unknown): boolean => u instanceof Uint8Array)) {
      throw new Error('EditorHandle.encodeDiffChunked returned something other than a list of updates');
    }
    return updates as Uint8Array[];
  }

  /** cdoc-crdt's Doc::gc over the known-peers record; returns the "CDG" collected record. */
  collectGarbage(known: Uint8Array): Uint8Array {
    return this.handle.gc(known);
  }

  /** Holds an image of at most `maxBytes`; returns the "CDI" added-image record. */
  addImage(bytes: Uint8Array, maxBytes: number): Uint8Array {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 0xffff_ffff) throw new Error(`maxBytes ${maxBytes} is not a u32`);
    return this.handle.addImage(bytes, maxBytes);
  }

  /**
   * The live document as a file. cdoc-edit-io adds the engine call; until it is vendored this
   * fails by name rather than exporting something else.
   */
  exportAs(format: ExportFormat): Uint8Array {
    const exportFn: unknown = (this.handle as unknown as { readonly exportAs?: unknown }).exportAs;
    if (typeof exportFn !== 'function') throw new Error(`this cdoc-wasm build cannot export ${format} (EditorHandle.exportAs is missing)`);
    const bytes: unknown = (exportFn as (format: string) => unknown).call(this.handle, format);
    if (!(bytes instanceof Uint8Array)) throw new Error('EditorHandle.exportAs returned no bytes');
    return bytes;
  }

  dispose(): void {
    this.handle.free();
  }
}
