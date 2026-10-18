/**
 * The primitive encodings against known vectors (`docs/display-list.md` v1 § Conventions; the
 * same vectors cdoc-paint's codec tests pin), and a header this decoder must refuse.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ByteReader, unzigzag } from '../byte-reader';
import { openDisplayList } from '../decoder';

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

  it('refuses any version but 1, naming both', () => {
    expect(() => openDisplayList(patched(4, 2))).toThrow(/version 2 is not supported \(this decoder reads 1\)/);
  });

  it('refuses reserved flags', () => {
    expect(() => openDisplayList(patched(6, 1))).toThrow(/flags/);
  });

  it('refuses a buffer shorter than the header', () => {
    expect(() => openDisplayList(golden.subarray(0, 23))).toThrow(/truncated/);
  });
});
