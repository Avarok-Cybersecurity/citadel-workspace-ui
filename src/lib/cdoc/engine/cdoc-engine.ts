/**
 * The document engine the worker runs: cdoc-wasm with its faces, one open document, and its
 * display list. No I/O of its own; the wasm module and the font source are handed in.
 *
 * R1 lays the document out once, at open, and keeps the whole display list: `paint(pages)`
 * answers from it, so scrolling never re-lays out. The reply holds every requested page and
 * may hold more (today, all of them); callers find pages by number through the page index.
 * An editable document is an EditorEngine (openEditor) instead, which paints only the pages
 * asked for; both share this engine's faces, and glyph outlines are asked for by face key, so
 * they answer for either.
 */
import { openDisplayList } from '../display-list/decoder';
import { DisplayListError } from '../display-list/byte-reader';
import type { DisplayList, FaceKey, PageEntry } from '../display-list/types';
import type { FontFaceEntry, FontManifest, FontSource } from '../fonts/font-manifest';
import type { CdocWasm, EditorSealedFonts, RenderAssets } from './cdoc-wasm-api';
import { EditorEngine, type EditorOrigin } from './editor-engine';
import type { DocumentSource } from '../document-source';

export interface OpenedDocument {
  readonly pageCount: number;
  /** Width, height pairs in Pt100, in page order. */
  readonly pageSizes: Int32Array;
}

export interface GlyphPathBatch {
  readonly records: Uint8Array;
  /** `glyphIds.length + 1` offsets into `records`. */
  readonly offsets: Uint32Array;
}

/**
 * RenderAssets takes the time its PDF output records. The display list records no time and
 * this engine never writes a PDF, so the clock is a fixed, visibly meaningless instant.
 */
interface OpenDoc {
  readonly bytes: Uint8Array;
  readonly list: DisplayList;
  readonly assets: RenderAssets;
}

const DISPLAY_LIST_HAS_NO_CLOCK: string = '1970-01-01T00:00:00Z';

type LoadedFace = readonly [FontFaceEntry, Uint8Array];

export class CdocEngine {
  private faces: Promise<readonly LoadedFace[]> | null = null;
  private assets: Promise<RenderAssets> | null = null;
  private editorFonts: Promise<EditorSealedFonts> | null = null;
  /** Set once the faces are in: glyph outlines and metrics answer from it synchronously. */
  private ready: RenderAssets | null = null;
  private doc: OpenDoc | null = null;

  constructor(
    private readonly wasm: CdocWasm,
    private readonly manifest: FontManifest,
    private readonly fonts: FontSource,
  ) {}

  /** Every face in the manifest, fetched once and in parallel; a failed fetch is retried next time. */
  private loadFaces(): Promise<readonly LoadedFace[]> {
    this.faces ??= Promise.all(
      this.manifest.faces.map(async (face: FontFaceEntry): Promise<LoadedFace> => [face, await this.fonts.load(face)]),
    );
    this.faces.catch((): void => {
      this.faces = null;
    });
    return this.faces;
  }

  private loadAssets(): Promise<RenderAssets> {
    this.assets ??= this.loadFaces().then((loaded: readonly LoadedFace[]): RenderAssets => {
      const assets: RenderAssets = new this.wasm.RenderAssets(this.manifest.fallback, DISPLAY_LIST_HAS_NO_CLOCK);
      for (const [face, bytes] of loaded) assets.addFont(face.family, face.bold, face.italic, bytes);
      for (const [name, target] of Object.entries(this.manifest.aliases)) assets.aliasFont(name, target);
      this.ready = assets;
      return assets;
    });
    this.assets.catch((): void => {
      this.assets = null;
    });
    return this.assets;
  }

  /** The faces sealed for editing, once for the engine's life (cdoc-edit: seal once, reuse). */
  private loadEditorFonts(): Promise<EditorSealedFonts> {
    this.editorFonts ??= this.loadFaces().then((loaded: readonly LoadedFace[]): EditorSealedFonts => {
      const fonts: InstanceType<CdocWasm['EditorFonts']> = new this.wasm.EditorFonts(this.manifest.fallback);
      for (const [face, bytes] of loaded) fonts.addFont(face.family, face.bold, face.italic, bytes);
      for (const [name, target] of Object.entries(this.manifest.aliases)) fonts.aliasFont(name, target);
      return fonts.seal();
    });
    this.editorFonts.catch((): void => {
      this.editorFonts = null;
    });
    return this.editorFonts;
  }

  /** Opens an editor as replica `client`; outlines for its pages come from this engine. */
  async openEditor(client: bigint, origin: EditorOrigin): Promise<EditorEngine> {
    const [fonts] = await Promise.all([this.loadEditorFonts(), this.loadAssets()]);
    this.doc = null;
    return EditorEngine.open(this.wasm, fonts, client, origin);
  }

  private pmJson(source: DocumentSource): string {
    switch (source.kind) {
      case 'blank': return this.wasm.blank_pm_json();
      case 'pm': return source.pmJson;
      case 'model': return this.wasm.model_to_pm(source.modelJson);
    }
  }

  async open(source: DocumentSource): Promise<OpenedDocument> {
    const assets: RenderAssets = await this.loadAssets();
    const bytes: Uint8Array = this.wasm.pm_to_display_list(this.pmJson(source), assets);
    const decoded: DisplayList = openDisplayList(bytes);
    this.doc = { bytes, list: decoded, assets };
    const pageSizes: Int32Array = new Int32Array(decoded.pages.length * 2);
    decoded.pages.forEach((p: PageEntry, i: number) => {
      pageSizes[2 * i] = p.width;
      pageSizes[2 * i + 1] = p.height;
    });
    return { pageCount: decoded.pages.length, pageSizes };
  }

  /** The open document's decoded list, for a painter in the same thread. */
  get list(): DisplayList {
    return this.current().list;
  }

  private current(): OpenDoc {
    if (this.doc === null) throw new DisplayListError('no document is open');
    return this.doc;
  }

  /** Display-list bytes holding at least `pages`, in a buffer of their own (transferable). */
  paint(pages: readonly number[]): Uint8Array {
    const list: DisplayList = this.list;
    for (const page of pages) {
      if (!Number.isInteger(page) || page < 0 || page >= list.pages.length) throw new DisplayListError(`page ${page} is not in the document`);
    }
    return this.current().bytes.slice();
  }

  private readyAssets(): RenderAssets {
    if (this.ready === null) throw new DisplayListError('no document is open, so no faces are loaded');
    return this.ready;
  }

  glyphPaths(face: FaceKey, glyphIds: Uint16Array): GlyphPathBatch {
    const assets: RenderAssets = this.readyAssets();
    const parts: Uint8Array[] = Array.from(glyphIds, (gid: number): Uint8Array => this.wasm.glyph_path(assets, face.family, face.bold, face.italic, gid));
    const offsets: Uint32Array = new Uint32Array(parts.length + 1);
    parts.forEach((p: Uint8Array, i: number) => {
      offsets[i + 1] = offsets[i] + p.length;
    });
    const records: Uint8Array = new Uint8Array(offsets[parts.length]);
    parts.forEach((p: Uint8Array, i: number) => records.set(p, offsets[i]));
    return { records, offsets };
  }

  faceMetrics(face: FaceKey): Uint8Array {
    return this.wasm.face_metrics(this.readyAssets(), face.family, face.bold, face.italic);
  }
}
