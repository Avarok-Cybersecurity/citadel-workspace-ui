/**
 * Where each glyph of a run stands, in Pt100 page space (`docs/display-list.md` v1 § Placing a
 * TEXT_RUN, § Placing a GLYPH_RUN). Visitor-shaped so painting a run allocates nothing.
 */
import type { Face, Op, RunHead } from './types';

export type GlyphVisitor = (glyphId: number, x: number, y: number) => void;

type TextRun = Extract<Op, { kind: 'textRun' }>;
type GlyphRun = Extract<Op, { kind: 'glyphRun' }>;

/** `floor((units · size + floor(upm / 2)) / upm)`: exact in doubles for any real run. */
export function nominalPen(units: number, size: number, unitsPerEm: number): number {
  return Math.floor((units * size + Math.floor(unitsPerEm / 2)) / unitsPerEm);
}

export function placeTextRun(run: TextRun, face: Face, visit: GlyphVisitor): void {
  const head: RunHead = run.head;
  let units: number = 0;
  for (let i: number = 0; i < run.indices.length; i++) {
    const metric: Face['glyphs'][number] = face.glyphs[run.indices[i]];
    visit(metric.glyphId, head.x + nominalPen(units, head.size, face.unitsPerEm), head.y);
    units += metric.advance;
  }
}

export function placeGlyphRun(run: GlyphRun, visit: GlyphVisitor): void {
  let pen: number = run.head.x;
  for (let i: number = 0; i < run.glyphIds.length; i++) {
    visit(run.glyphIds[i], pen + run.dx[i], run.head.y + run.dy[i]);
    pen += run.advances[i];
  }
}
