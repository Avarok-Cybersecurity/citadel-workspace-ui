import { describe, it, expect } from 'vitest';
import { tryParseCid } from './cid-utils';

describe('tryParseCid', () => {
  it('parses a plain positive decimal CID (trimming surrounding whitespace)', () => {
    expect(tryParseCid('12345')).toBe(12345n);
    expect(tryParseCid('  789  ')).toBe(789n);
  });

  it('rejects nullish, empty, and whitespace-only input', () => {
    expect(tryParseCid(null)).toBeUndefined();
    expect(tryParseCid(undefined)).toBeUndefined();
    expect(tryParseCid('')).toBeUndefined();
    expect(tryParseCid('   ')).toBeUndefined();
  });

  it('rejects non-decimal, negative, and zero values that BigInt() would otherwise accept', () => {
    expect(tryParseCid('abc')).toBeUndefined();
    expect(tryParseCid('-1')).toBeUndefined();
    expect(tryParseCid('0')).toBeUndefined();
    expect(tryParseCid('12.5')).toBeUndefined();
    expect(tryParseCid('0x1f')).toBeUndefined();
    expect(tryParseCid('1e3')).toBeUndefined();
    expect(tryParseCid('123abc')).toBeUndefined();
  });
});
