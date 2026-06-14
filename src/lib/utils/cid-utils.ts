/**
 * CID Utilities
 *
 * Centralized utilities for CID (Client ID) type conversion and manipulation.
 * CIDs are canonically bigint but may arrive as string or number from various sources.
 */

/**
 * Ensures a value is a bigint CID.
 * Handles string, number, and bigint inputs.
 * @throws Error if the value cannot be converted to a valid bigint
 */
export function ensureBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  throw new Error(`Cannot convert ${typeof value} to bigint`);
}

/**
 * Safely converts a possibly-undefined CID to bigint.
 * Returns null if the value is null/undefined.
 */
export function ensureBigIntOrNull(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }
  return ensureBigInt(value);
}

/**
 * Converts two CID values to bigints (for peer pairs).
 * Common pattern in P2P operations.
 */
export function ensureBigIntPair(
  localCid: string | number | bigint,
  peerCid: string | number | bigint
): [bigint, bigint] {
  return [ensureBigInt(localCid), ensureBigInt(peerCid)];
}

/**
 * Converts a CID to string for serialization or display.
 */
export function cidToString(cid: bigint): string {
  return cid.toString();
}

/**
 * Creates a CID key for Map/Set operations.
 * Uses string representation for consistent hashing.
 */
export function cidKey(cid: bigint): string {
  return cid.toString();
}

/**
 * Creates a composite key from two CIDs (for peer pair tracking).
 * Normalizes order to ensure consistent keys regardless of direction.
 */
export function cidPairKey(cid1: bigint, cid2: bigint): string {
  const [smaller, larger] = cid1 < cid2 ? [cid1, cid2] : [cid2, cid1];
  return `${smaller.toString()}-${larger.toString()}`;
}

/**
 * Type guard to check if a value is a valid CID-like value.
 */
export function isCidLike(value: unknown): value is string | number | bigint {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint';
}

/**
 * Best-effort parse of a CID-like string into a bigint, returning
 * `undefined` for any malformed input rather than throwing.
 *
 * Use this on CID values arriving from URL params, IndexedDB
 * sessions, or anywhere a `BigInt(value)` call would otherwise
 * crash a render. The standard safe pattern:
 *
 * ```ts
 * const cid = tryParseCid(maybeCid);
 * if (cid === undefined) return <Fallback />;
 * // … use cid as bigint …
 * ```
 *
 * Centralised here (rather than re-implementing the try/catch at
 * each call site) so the test in
 * `cid-utils.test.ts#tryParseCid` is the single source of truth
 * for the parsing contract.
 */
export function tryParseCid(value: string | undefined | null): bigint | undefined {
  // `BigInt()` is too lenient for CID parsing: `BigInt(' ')` is `0n` and
  // `BigInt('-1')` is `-1n`, so whitespace, zero, and negative strings would
  // slip through as "valid" CIDs and get used for routing / persisted
  // sessions. Require a plain non-empty decimal string and a positive result.
  const trimmed = value?.trim();
  if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
    return undefined;
  }
  const cid = BigInt(trimmed);
  return cid > 0n ? cid : undefined;
}
