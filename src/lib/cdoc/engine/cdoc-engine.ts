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
import type { CdocWasm, EditorSealedFonts, ImageStore, RenderAssets } from './cdoc-wasm-api';
import { EditorEngine, type EditorOrigin } from './editor-engine';
import type { DocumentSource } from '../document-source';
import { NOT_CONVERTED, refusedMacros } from '../conversion-report';
import type { ConversionReport, ExportedFile, ExportTarget } from '../editor/file-formats';
import { exportFile, importFile, type ImportedFile } from './file-codec';

/**
 * What opening produced. A file whose macros the importer refused is not opened as a Docs
 * document at all: the person is told, and the file is left as it is.
 */
export type OpenedDocument =
  | {
      readonly kind: 'opened';
      readonly pageCount: number;
      /** Width, height pairs in Pt100, in page order. */
      readonly pageSizes: Int32Array;
      readonly report: ConversionReport;
    }
  | { readonly kind: 'refused'; readonly reason: 'macros'; readonly report: ConversionReport };

export interface GlyphPathBatch {
  readonly records: Uint8Array;
  /** `glyphIds.length + 1` offsets into `records`. */
  readonly offsets: Uint32Array;
}

interface OpenDoc {
  readonly bytes: Uint8Array;
  readonly list: DisplayList;
  readonly assets: RenderAssets;
  readonly pmJson: string;
  readonly images: ImageStore;
}

/**
 * RenderAssets takes the time its PDF output records. The display list records no time, so the
 * page view's assets carry a fixed, visibly meaningless instant; a PDF export brings its own.
 */
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

  private buildAssets(loaded: readonly LoadedFace[], clock: string): RenderAssets {
    const assets: RenderAssets = new this.wasm.RenderAssets(this.manifest.fallback, clock);
    for (const [face, bytes] of loaded) assets.addFont(face.family, face.bold, face.italic, bytes);
    for (const [name, target] of Object.entries(this.manifest.aliases)) assets.aliasFont(name, target);
    return assets;
  }

  private loadAssets(): Promise<RenderAssets> {
    this.assets ??= this.loadFaces().then((loaded: readonly LoadedFace[]): RenderAssets => {
      const assets: RenderAssets = this.buildAssets(loaded, DISPLAY_LIST_HAS_NO_CLOCK);
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
    this.doc?.images.free();
    this.doc = null;
    return EditorEngine.open(this.wasm, fonts, client, origin);
  }

  private resolve(source: DocumentSource): ImportedFile {
    switch (source.kind) {
      case 'blank': return { pmJson: this.wasm.blank_pm_json(), report: NOT_CONVERTED, images: new this.wasm.ImageStore() };
      case 'pm': return { pmJson: source.pmJson, report: NOT_CONVERTED, images: new this.wasm.ImageStore() };
      case 'model': return { pmJson: this.wasm.model_to_pm(source.modelJson), report: NOT_CONVERTED, images: new this.wasm.ImageStore() };
      case 'file': return importFile(this.wasm, source.format, source.bytes);
    }
  }

  async open(source: DocumentSource): Promise<OpenedDocument> {
    const assets: RenderAssets = await this.loadAssets();
    const file: ImportedFile = this.resolve(source);
    if (refusedMacros(file.report).length > 0) {
      file.images.free();
      return { kind: 'refused', reason: 'macros', report: file.report };
    }
    let bytes: Uint8Array;
    let decoded: DisplayList;
    try {
      addImages(assets, file.images);
      bytes = this.wasm.pm_to_display_list(file.pmJson, assets);
      decoded = openDisplayList(bytes);
    } catch (error: unknown) {
      file.images.free();
      throw error;
    }
    this.doc?.images.free();
    this.doc = { bytes, list: decoded, assets, pmJson: file.pmJson, images: file.images };
    const pageSizes: Int32Array = new Int32Array(decoded.pages.length * 2);
    decoded.pages.forEach((p: PageEntry, i: number) => {
      pageSizes[2 * i] = p.width;
      pageSizes[2 * i + 1] = p.height;
    });
    return { kind: 'opened', pageCount: decoded.pages.length, pageSizes, report: file.report };
  }

  /** The open (static) document written by the engine in another format. */
  async export(target: ExportTarget): Promise<ExportedFile> {
    const faces: readonly LoadedFace[] = await this.loadFaces();
    const doc: OpenDoc = this.current();
    return exportFile(this.wasm, target, doc.pmJson, doc.images, (clock: string): RenderAssets => {
      const assets: RenderAssets = this.buildAssets(faces, clock);
      addImages(assets, doc.images);
      return assets;
    });
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

function addImages(assets: RenderAssets, images: ImageStore): void {
  for (let i: number = 0; i < images.len(); i++) {
    const id: string | undefined = images.id(i);
    const mime: string | undefined = images.mime(i);
    const bytes: Uint8Array | undefined = images.bytes(i);
    if (id === undefined || mime === undefined || bytes === undefined) throw new Error(`image ${i} of the document is incomplete`);
    assets.addImage(id, mime, bytes);
  }
}
