/**
 * The primitive encodings against known vectors (`docs/display-list.md` v2 § Conventions; the
 * same vectors cdoc-paint's codec tests pin), and a header this decoder must refuse.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ByteReader, unzigzag } from '../byte-reader';
import { openDisplayList } from '../decoder';
import { decodePage } from '../page-ops';
import type { DisplayList, DocumentTable, Op } from '../types';

function reader(bytes: number[]): ByteReader {
  return new ByteReader(new DataView(new Uint8Array(bytes).buffer), 0, bytes.length);
}

describe('uv', () => {
  it.each([
    [[0x00], 0],
    [[0x7f], 127],
    [[0x80, 0x01], 128],
    [[0xe5, 0x8e, 0x26], 624485],
    [[0xff, 0xff, 0xff, 0xff, 0x0f], 0xffffffff],
  ])('%j reads as %d', (bytes: number[], value: number) => {
    const r: ByteReader = reader(bytes);
    expect(r.uv()).toBe(value);
    expect(r.done).toBe(true);
  });

  it('refuses a fifth byte above 0x0F', () => {
    expect(() => reader([0xff, 0xff, 0xff, 0xff, 0x10]).uv()).toThrow(/overflows/);
  });

  it('refuses a varint that runs off the end', () => {
    expect(() => reader([0x80]).uv()).toThrow(/truncated/);
  });
});

describe('zz', () => {
  it.each([
    [0, 0], [1, -1], [2, 1], [3, -2], [4, 2],
    [0xfffffffe, 2147483647], [0xffffffff, -2147483648],
  ])('folded %d unfolds to %d', (folded: number, value: number) => {
    expect(unzigzag(folded)).toBe(value);
  });

  it('reads a negative coordinate through uv', () => {
    // -7201 folds to 14401 = 0xC1 0x70.
    expect(reader([0xc1, 0x70]).zz()).toBe(-7201);
  });
});

describe('str', () => {
  it('reads a length-prefixed UTF-8 string in place', () => {
    expect(reader([0x03, 0xe2, 0x82, 0xac, 0x41]).str()).toBe('€');
  });

  it('refuses bytes that are not UTF-8', () => {
    expect(() => reader([0x01, 0xff]).str()).toThrow(/UTF-8/);
  });
});

describe('the header', () => {
  const golden: Uint8Array = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'every-op.bin')));
  const patched = (at: number, byte: number): Uint8Array => {
    const copy: Uint8Array = golden.slice();
    copy[at] = byte;
    return copy;
  };

  it('opens the unmodified golden', () => {
    expect(openDisplayList(golden).pages).toHaveLength(2);
  });

  it('refuses a wrong magic', () => {
    expect(() => openDisplayList(patched(0, 0x58))).toThrow(/bad magic/);
  });

  it('refuses any version but 3, naming both: the retired 2 and a later 4 alike', () => {
    expect(() => openDisplayList(patched(4, 2))).toThrow(/version 2 is not supported \(this decoder reads 3\)/);
    expect(() => openDisplayList(patched(4, 4))).toThrow(/version 4 is not supported \(this decoder reads 3\)/);
  });

  it('refuses a document table longer than its entries', () => {
    const indexAt: number = new DataView(golden.buffer, golden.byteOffset).getUint32(20, true);
    // every-op.bin's outline: count 2, then (0, 0, zz -5, title) in 4 bytes and (3, 7, zz 70000, title) in 6.
    const countAt: number = indexAt - 10 - 1;
    expect(golden[countAt]).toBe(2);
    expect(() => openDisplayList(patched(countAt, 1))).toThrow(/document table does not end where the page index begins/);
  });

  it('refuses reserved flags', () => {
    expect(() => openDisplayList(patched(6, 1))).toThrow(/flags/);
  });

  it('refuses a buffer shorter than the header', () => {
    expect(() => openDisplayList(golden.subarray(0, 23))).toThrow(/truncated/);
  });
});

describe('element counts', () => {
  it('reads a count the remaining bytes can hold', () => {
    const r: ByteReader = reader([0x02, 0xaa, 0xbb]);
    expect(r.count(1, 'a list')).toBe(2);
  });

  it('refuses a count the remaining bytes cannot hold, naming it, before sizing anything by it', () => {
    expect(() => reader([0x03, 0xaa, 0xbb]).count(1, 'a list')).toThrow(/a list claims 3 entries, but only 2 bytes remain/);
    expect(() => reader([0x01, 0xaa, 0xbb, 0xcc]).count(4, 'a glyph run')).toThrow(/a glyph run claims 1 entries, but only 3 bytes remain/);
  });
});

const NO_DOCUMENT: DocumentTable = { title: null, language: null, outline: [] };

function bodyList(body: number[], strings: readonly string[] = []): DisplayList {
  return {
    view: new DataView(new Uint8Array(body).buffer),
    faces: [{ faceId: 0, family: 'Carlito', bold: false, italic: false, unitsPerEm: 2048, glyphs: [] }],
    strings,
    document: NO_DOCUMENT,
    pages: [{ number: 0, offset: 0, length: body.length, width: 59530, height: 84190 }],
    indexEnd: 0,
  };
}

describe('a glyph run', () => {
  // Face 0, size 0, opaque black, at (0, 0); text "aé" (é is two bytes); glyph 1 at cluster 0,
  // glyph 2 at `second`; advances and offsets 0.
  const run = (second: number, opcode: number = 0x11): number[] => [
    opcode, 23, 0, 0, 0, 0, 0, 0xff, 0, 0, 0x03, 0x61, 0xc3, 0xa9, 2, 1, 0, 0, 0, 0, 2, second, 0, 0, 0,
  ];

  it('carries its text and each glyph\'s cluster', () => {
    const op: Op = decodePage(bodyList(run(1)), 0).ops[0];
    expect(op.kind === 'glyphRun' && [op.text, [...op.clusters], [...op.glyphIds]]).toEqual(['aé', [0, 1], [1, 2]]);
  });

  it('accepts a cluster at the end of its text', () => {
    expect(decodePage(bodyList(run(3)), 0).ops).toHaveLength(1);
  });

  it.each([
    [2, 'inside a character'],
    [4, 'past the text'],
  ])('refuses a cluster at byte %d, %s', (cluster: number) => {
    expect(() => decodePage(bodyList(run(cluster)), 0)).toThrow(/cluster \d+ decreases or is not a character boundary/);
  });

  it('refuses a cluster that decreases', () => {
    const body: number[] = run(0);
    body[16] = 1; // the first glyph's cluster: 1, then 0
    expect(() => decodePage(bodyList(body), 0)).toThrow(/cluster 0 decreases/);
  });

  it('refuses 0x10, version 1\'s retired TEXT_RUN, as an unknown opcode', () => {
    expect(() => decodePage(bodyList(run(1, 0x10)), 0)).toThrow(/unknown opcode 0x10/);
  });
});

describe('a signature field', () => {
  // Rect (1, 2, 3, 4) as zz, then the field id and the signer role by string index.
  const body: number[] = [0x22, 6, 2, 4, 6, 8, 0, 1];

  it('carries its rect, field id and role', () => {
    expect(decodePage(bodyList(body, ['sig-1', 'Approver']), 0).ops).toEqual([{ kind: 'sigField', rect: { x: 1, y: 2, w: 3, h: 4 }, fieldId: 'sig-1', role: 'Approver' }]);
  });

  it('refuses a role past the string table', () => {
    expect(() => decodePage(bodyList(body, ['sig-1']), 0)).toThrow(/string index 1 is past the string table/);
  });
});

describe('a crafted page body', () => {
  // A fill path (opcode, length 11, rgba) whose path claims 2^28 verbs with two bytes left: the
  // count must be refused before a 256 MB array is allocated for it (a crafted list can claim 4 GB).
  const body: number[] = [0x04, 0x0b, 0, 0, 0, 0xff, 0x80, 0x80, 0x80, 0x80, 0x01, 0x00, 0x00];
  const list: DisplayList = {
    view: new DataView(new Uint8Array(body).buffer),
    faces: [],
    strings: [],
    document: NO_DOCUMENT,
    pages: [{ number: 0, offset: 0, length: body.length, width: 59530, height: 84190 }],
    indexEnd: 0,
  };

  it('refuses a path count larger than its payload, without allocating it', () => {
    expect(() => decodePage(list, 0)).toThrow(/a path claims 268435456 entries, but only 2 bytes remain/);
  });
});
