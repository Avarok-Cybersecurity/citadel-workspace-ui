import { describe, it, expect } from 'vitest';
import { tryParseCid } from '../cid-utils';

/**
 * Tests for `tryParseCid`. The function is the single source of
 * truth for "best-effort BigInt parsing that doesn't throw" — every
 * call site that previously had its own try/catch around
 * `BigInt(...)` should be funnelled through this helper, so any
 * future change to the parsing contract (rejecting whitespace,
 * scientific notation, etc.) lives in one place.
 *
 * Anchors the WorkspaceView fallback path: when the URL contains a
 * malformed `channel=` param or session storage is corrupted,
 * `tryParseCid` returns `undefined` instead of throwing during
 * render — the component then falls back to the non-P2P workspace
 * view. Without these tests, a "fix" that re-throws on invalid
 * input would silently re-introduce the crash that motivated the
 * helper.
 */
describe('tryParseCid', () => {
  it('parses a valid numeric string into a bigint', () => {
    expect(tryParseCid('12345')).toBe(12345n);
  });

  it('parses a large numeric string that exceeds Number.MAX_SAFE_INTEGER', () => {
    // CIDs are u64-shaped and routinely exceed 2^53. The whole point
    // of the bigint type is that we don't lose precision here.
    expect(tryParseCid('18446744073709551615')).toBe(18446744073709551615n);
  });

  it('parses zero', () => {
    expect(tryParseCid('0')).toBe(0n);
  });

  it('returns undefined for null', () => {
    expect(tryParseCid(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(tryParseCid(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    // Empty-string input historically came from `params.get('channel')`
    // when the param was present but blank — `BigInt('')` returns 0n,
    // which would be wrong (0 is a sentinel CID elsewhere). The
    // explicit empty-string short-circuit avoids that confusion.
    expect(tryParseCid('')).toBeUndefined();
  });

  it('returns undefined for a non-numeric string instead of throwing', () => {
    expect(tryParseCid('not-a-number')).toBeUndefined();
    expect(tryParseCid('abc123')).toBeUndefined();
    expect(tryParseCid('123abc')).toBeUndefined();
  });

  it('returns undefined for fractional / scientific notation', () => {
    // BigInt() rejects these — pin the behaviour so a future
    // "parse leniently" change has to update this test deliberately.
    expect(tryParseCid('1.5')).toBeUndefined();
    expect(tryParseCid('1e10')).toBeUndefined();
  });

  it('handles negative numbers (BigInt accepts them)', () => {
    // Real CIDs are unsigned, but the parser doesn't enforce that
    // — the contract is "successfully convert to bigint or
    // undefined". Range validation is the caller's concern.
    expect(tryParseCid('-1')).toBe(-1n);
  });
});
