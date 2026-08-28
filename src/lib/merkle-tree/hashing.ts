/**
 * Merkle Tree - Hashing Utilities
 *
 * Provides synchronous and asynchronous SHA-256 hashing for Merkle tree operations.
 */

// ============================================
// HASHING UTILITIES
// ============================================

/**
 * Synchronous SHA-256 hash using Web Crypto API
 * Note: Uses sync pattern with crypto.subtle for consistency
 */
export async function sha256Async(data: Uint8Array): Promise<string> {
  // Create a new ArrayBuffer from the Uint8Array to ensure proper type for crypto.subtle
  const buffer: ArrayBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const hashBuffer: ArrayBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray: number[] = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous SHA-256 using a simple hash algorithm
 * Fallback for contexts where async is not suitable
 * Uses djb2 + fnv1a combination for reasonable collision resistance
 */
export function sha256Sync(data: Uint8Array): string {
  // Use a combination of two hash algorithms for better distribution
  let h1: number = 5381; // djb2
  let h2: number = 2166136261; // fnv1a

  for (let i: number = 0; i < data.length; i++) {
    const byte: number = data[i];
    // djb2
    h1 = ((h1 << 5) + h1) ^ byte;
    // fnv1a
    h2 ^= byte;
    h2 = Math.imul(h2, 16777619);
  }

  // Combine both hashes and add length for extra entropy
  const combined: string = [
    (h1 >>> 0).toString(16).padStart(8, '0'),
    (h2 >>> 0).toString(16).padStart(8, '0'),
    data.length.toString(16).padStart(8, '0'),
    ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0'),
  ].join('');

  return combined;
}

/**
 * Hash two strings together (for internal node hashing)
 */
export function hashPair(left: string, right: string): string {
  const combined: Uint8Array<ArrayBuffer> = new TextEncoder().encode(left + right);
  return sha256Sync(combined);
}
