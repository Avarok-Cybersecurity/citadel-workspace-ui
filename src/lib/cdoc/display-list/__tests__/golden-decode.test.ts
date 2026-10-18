/**
 * The goldens decode to what the Rust reader (cdoc_paint::decode) says they hold: per page,
 * every op kind's count, the glyph count, a checksum over glyph ids and pen advances, and the
 * first text run's pen positions. goldens.json was written by that reader, not by this one.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDisplayList } from '../decoder';
import { decodePage } from '../page-ops';
import { nominalPen } from '../text-placement';
import type { DisplayList, Face, Op, OpKind } from '../types';

interface ExpectedPage {
  number: number;
  width: number;
  height: number;
  counts: Record<OpKind, number>;
  glyphs: number;
  textSum: number;
  firstRunPens: number[];
}
interface Golden { file: string; sha256: string; faces: number; pages: ExpectedPage[] }

const FIXTURES: string = join(__dirname, 'fixtures');
const goldens: Golden[] = (JSON.parse(readFileSync(join(FIXTURES, 'goldens.json'), 'utf8')) as { goldens: Golden[] }).goldens;

interface Seen { counts: Record<string, number>; glyphs: number; textSum: number; firstRunPens: number[] }

function pensOf(op: Extract<Op, { kind: 'textRun' }>, face: Face): number[] {
  const pens: number[] = [];
  let units: number = 0;
  for (const index of op.indices) {
    pens.push(op.head.x + nominalPen(units, op.head.size, face.unitsPerEm));
    units += face.glyphs[index].advance;
  }
  pens.push(op.head.x + nominalPen(units, op.head.size, face.unitsPerEm));
  return pens;
}

function summarise(list: DisplayList, ops: readonly Op[]): Seen {
  const seen: Seen = { counts: {}, glyphs: 0, textSum: 0, firstRunPens: [] };
  for (const op of ops) {
    seen.counts[op.kind] = (seen.counts[op.kind] ?? 0) + 1;
    if (op.kind === 'textRun') {
      const face: Face = list.faces[op.head.faceId];
      const pens: number[] = pensOf(op, face);
      op.indices.forEach((index: number, i: number) => {
        seen.textSum += face.glyphs[index].glyphId + (pens[i + 1] - pens[i]);
      });
      seen.glyphs += op.indices.length;
      if (seen.firstRunPens.length === 0) seen.firstRunPens = pens;
    } else if (op.kind === 'glyphRun') {
      op.glyphIds.forEach((id: number, i: number) => {
        seen.textSum += id + op.advances[i] + op.dx[i] + op.dy[i];
      });
      seen.glyphs += op.glyphIds.length;
    }
  }
  return seen;
}

describe.each(goldens)('golden $file', (golden: Golden) => {
  const bytes: Buffer = readFileSync(join(FIXTURES, golden.file));

  it('is the file goldens.json describes', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(golden.sha256);
  });

  it('decodes, page by page, to what the Rust reader decoded', () => {
    const list: DisplayList = openDisplayList(bytes);
    expect(list.faces).toHaveLength(golden.faces);
    expect(list.pages.map((p) => [p.number, p.width, p.height])).toEqual(golden.pages.map((p) => [p.number, p.width, p.height]));
    golden.pages.forEach((page: ExpectedPage, slot: number) => {
      const seen: Seen = summarise(list, decodePage(list, slot).ops);
      const nonZero: Record<string, number> = Object.fromEntries(Object.entries(page.counts).filter(([, n]) => n > 0));
      expect(seen.counts, `page slot ${slot} op counts`).toEqual(nonZero);
      expect(seen.glyphs, `page slot ${slot} glyphs`).toBe(page.glyphs);
      expect(seen.textSum, `page slot ${slot} glyph checksum`).toBe(page.textSum);
      expect(seen.firstRunPens, `page slot ${slot} pens`).toEqual(page.firstRunPens);
    });
  });
});

describe('a buffer cut short after page N', () => {
  const bytes: Buffer = readFileSync(join(FIXTURES, 'hundred-pages.bin'));
  const full: DisplayList = openDisplayList(bytes);
  const n: number = 41;
  const cut: Uint8Array = new Uint8Array(bytes.subarray(0, full.pages[n].offset + full.pages[n].length));

  it('still opens and serves pages 0..=N exactly as the full buffer does', () => {
    const partial: DisplayList = openDisplayList(cut);
    for (let slot: number = 0; slot <= n; slot++) {
      expect(decodePage(partial, slot).ops).toEqual(decodePage(full, slot).ops);
    }
  });

  it('refuses page N + 1, which it does not hold', () => {
    expect(() => decodePage(openDisplayList(cut), n + 1)).toThrow(/truncated/);
  });

  it('refuses a cut inside the page index', () => {
    expect(() => openDisplayList(bytes.subarray(0, full.indexEnd - 1))).toThrow(/truncated/);
  });
});
