import { describe, it, expect } from 'vitest';
import { isUsablePeerCid } from '../peer-cid-input';

describe('isUsablePeerCid', () => {
  it('accepts a real CID', () => {
    expect(isUsablePeerCid('13961676296247425873')).toBe(true);
  });

  it('tolerates surrounding whitespace, which paste introduces', () => {
    expect(isUsablePeerCid('  13961676296247425873 ')).toBe(true);
  });

  it('rejects a username — the input people actually try', () => {
    // The case that silently did nothing: BigInt('alice') throws.
    expect(isUsablePeerCid('alice')).toBe(false);
  });

  it('rejects a CID with a stray character', () => {
    expect(isUsablePeerCid('1396167629624742587x')).toBe(false);
  });

  it('rejects an internal space, which a split paste produces', () => {
    expect(isUsablePeerCid('139616 76296247425873')).toBe(false);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(isUsablePeerCid('')).toBe(false);
    expect(isUsablePeerCid('   ')).toBe(false);
  });
});
