/**
 * The app ABI's CBOR, both ways. One encoder configuration for every host reply and event, so a
 * reply's bytes do not depend on where it was built: no record extension (ciborium cannot read it)
 * and no tag 64 on byte strings (cbor-x adds it under Node, never in a browser, which would make
 * tests and pages disagree). Decoding never throws: hostile bytes are a value of `undefined`.
 */
import { Encoder } from 'cbor-x';

const codec: Encoder = new Encoder({ useRecords: false, tagUint8Array: false, mapsAsObjects: true });

export function encodeCbor(value: unknown): Uint8Array {
  const out: Uint8Array = codec.encode(value);
  // cbor-x can hand back a view onto its scratch buffer; the copy owns its bytes.
  return Uint8Array.from(out);
}

export type Decoded = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

export function decodeCbor(bytes: Uint8Array): Decoded {
  if (bytes.byteLength === 0) return { ok: false };
  try {
    return { ok: true, value: codec.decode(bytes) };
  } catch {
    return { ok: false };
  }
}

export type CborMap = Readonly<Record<string, unknown>>;

/** A decoded CBOR map with string keys (what every call's arguments must be). */
export function isCborMap(value: unknown): value is CborMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value) && !(value instanceof Map);
}
