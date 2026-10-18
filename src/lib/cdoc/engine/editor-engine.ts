/**
 * One editing session in the worker: cdoc-edit's EditorHandle over sealed faces. Records in,
 * records out (docs/edit-commands.md v1); this class decodes none of them, it only checks the
 * arguments the handle would otherwise read as something else. Every returned array is a copy
 * out of wasm memory, so it owns its buffer and can be transferred.
 */
import type { CdocWasm, EditorHandle, EditorSealedFonts } from './cdoc-wasm-api';
import type { EditorOrigin } from '../editor/controller';

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
    const handle: EditorHandle = 'snapshot' in origin
      ? wasm.EditorHandle.open(origin.snapshot, client, fonts)
      : wasm.EditorHandle.blank(client, fonts);
    return new EditorEngine(handle);
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

  /**
   * cdoc-crdt's Doc::gc. EditorHandle exposes it from the cdoc-edit caret-state release on; on
   * an older binary this fails rather than pretending to have collected anything.
   */
  collectGarbage(): void {
    const gc: unknown = (this.handle as unknown as { readonly gc?: unknown }).gc;
    if (typeof gc !== 'function') throw new Error('this cdoc-wasm build cannot collect garbage (EditorHandle.gc is missing)');
    (gc as () => void).call(this.handle);
  }

  /** EditorHandle.addImage (from the caret-state release on): stores bytes, returns the content id. */
  addImage(bytes: Uint8Array, mime: string): string {
    const add: unknown = (this.handle as unknown as { readonly addImage?: unknown }).addImage;
    if (typeof add !== 'function') throw new Error('this cdoc-wasm build cannot store images (EditorHandle.addImage is missing)');
    const id: unknown = (add as (bytes: Uint8Array, mime: string) => unknown).call(this.handle, bytes, mime);
    if (typeof id !== 'string' || id === '') throw new Error('EditorHandle.addImage returned no content id');
    return id;
  }

  dispose(): void {
    this.handle.free();
  }
}
