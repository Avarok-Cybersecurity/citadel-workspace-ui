/**
 * Everything one painter instance keeps between paints: the display list, the pages decoded
 * from it, the glyph outlines and the atlas. The main-thread renderer and the worker's
 * OffscreenCanvas renderer both own one; they differ only in where outlines come from (a
 * worker round trip, or cdoc-wasm in the same thread), which is why `missingGlyphs` and
 * `addOutlines` are separate from `paint`, which never waits.
 */
import { slotOfPage } from '../display-list/decoder';
import { decodePage } from '../display-list/page-ops';
import { placeGlyphRun, placeTextRun } from '../display-list/text-placement';
import type { DisplayList, PageOps } from '../display-list/types';
import { DisplayListError } from '../display-list/byte-reader';
import type { CanvasPort, PaintTarget } from './canvas-port';
import { GlyphAtlas, type AtlasConfig, type AtlasStats } from './glyph-atlas';
import { OutlineStore } from './glyph-outlines';
import { paintPage, type LinkArea } from './page-painter';
import { pageSizePx, type DeviceScale } from './units';

export interface RasterizerOptions {
  readonly atlas: AtlasConfig;
  readonly paper: string;
  readonly missingImageStroke: string;
}

export interface PaintOutcome {
  readonly links: readonly LinkArea[];
  readonly atlas: AtlasStats;
}

export class PageRasterizer {
  private list: DisplayList | null = null;
  private readonly pages: Map<number, PageOps> = new Map<number, PageOps>();
  private readonly outlines: OutlineStore;
  private readonly atlas: GlyphAtlas;

  constructor(port: CanvasPort, private readonly options: RasterizerOptions) {
    this.outlines = new OutlineStore(port);
    this.atlas = new GlyphAtlas(port, options.atlas);
  }

  /** Replaces the pages this list holds (a partial list replaces only its own pages). */
  setList(list: DisplayList): void {
    this.list = list;
    for (const entry of list.pages) this.pages.delete(entry.number);
  }

  holds(pageNumber: number): boolean {
    return this.list !== null && slotOfPage(this.list, pageNumber) !== null;
  }

  private page(pageNumber: number): PageOps {
    let page: PageOps | undefined = this.pages.get(pageNumber);
    if (page === undefined) {
      const list: DisplayList = this.requireList();
      const slot: number | null = slotOfPage(list, pageNumber);
      if (slot === null) throw new DisplayListError(`page ${pageNumber} is not in the display list`);
      page = decodePage(list, slot);
      this.pages.set(pageNumber, page);
    }
    return page;
  }

  private requireList(): DisplayList {
    if (this.list === null) throw new DisplayListError('painted before a display list was set');
    return this.list;
  }

  /** The glyphs `pageNumber` sets whose outlines this painter does not hold yet, by face. */
  missingGlyphs(pageNumber: number): Map<number, Uint16Array> {
    const wanted: Map<number, Set<number>> = new Map<number, Set<number>>();
    const faces: DisplayList['faces'] = this.requireList().faces;
    for (const op of this.page(pageNumber).ops) {
      if (op.kind !== 'textRun' && op.kind !== 'glyphRun') continue;
      const faceId: number = op.head.faceId;
      const note = (glyphId: number): void => {
        if (this.outlines.has(faceId, glyphId)) return;
        let set: Set<number> | undefined = wanted.get(faceId);
        if (set === undefined) wanted.set(faceId, (set = new Set<number>()));
        set.add(glyphId);
      };
      if (op.kind === 'textRun') placeTextRun(op, faces[faceId], note);
      else placeGlyphRun(op, note);
    }
    return new Map<number, Uint16Array>([...wanted].map(([face, ids]) => [face, Uint16Array.from(ids)]));
  }

  addOutlines(faceId: number, glyphIds: Uint16Array, records: Uint8Array, offsets: Uint32Array): void {
    this.outlines.add(faceId, glyphIds, records, offsets);
  }

  /** Sizes `target` to the page in device px and paints it. Every outline must be present. */
  paint(target: PaintTarget, pageNumber: number, scale: DeviceScale): PaintOutcome {
    const page: PageOps = this.page(pageNumber);
    const size: { readonly w: number; readonly h: number } = pageSizePx(page.entry.width, page.entry.height, scale.k);
    target.resize(size.w, size.h);
    const links: LinkArea[] = paintPage({
      ctx: target.ctx, scale, faces: this.requireList().faces, atlas: this.atlas, outlines: this.outlines,
      paper: this.options.paper, missingImageStroke: this.options.missingImageStroke,
    }, page);
    return { links, atlas: this.atlas.stats() };
  }
}
