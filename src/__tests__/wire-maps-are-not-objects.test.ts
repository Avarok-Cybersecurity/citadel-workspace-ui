/**
 * A Rust `HashMap` arrives as a JS `Map`, whatever the generated type says.
 *
 * serde-wasm-bindgen is configured without `serialize_maps_as_objects`, so a
 * Rust `HashMap` crosses as a real `Map`. ts-rs declares the same field
 * `Record<string, T>`. Both are "correct"; together they mean `Object.keys` and
 * `Object.entries` return nothing, silently, and the compiler agrees with you.
 *
 * That cost `peer_connections` twice. The fix was found once and applied in
 * `p2p-registration-service/connection.ts`, whose comment spells it out — and
 * two sites in `p2p-auto-connect-service` kept the object form, so
 * `refreshFromBackend` merged nothing and auto-connect always took the "no
 * peer_connections in session" fallback. The server's view of who a session is
 * connected to was unreachable from either path.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { stripComments } from '@/test-utils/strip-comments';

const SRC: string = join(process.cwd(), 'src');

/** Fields that cross the wire as a Rust HashMap. */
const WIRE_MAPS: string[] = ['peer_connections'];

/** Reading one as a plain object, which yields nothing at runtime. */
const AS_OBJECT = (field: string): RegExp =>
  new RegExp(String.raw`Object\.(?:keys|entries|values)\s*\([^)]*\b${field}\b`);

describe('a field that is a Rust HashMap', () => {
  it('is read with wireMapEntries, not Object.keys', async () => {
    const files: string[] = await fg(['**/*.ts', '**/*.tsx'], {
      cwd: SRC,
      ignore: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'test-utils/**'],
    });

    const offenders: string[] = [];

    for (const rel of files) {
      const source: string = stripComments(readFileSync(join(SRC, rel), 'utf-8'));
      for (const field of WIRE_MAPS) {
        if (AS_OBJECT(field).test(source)) offenders.push(`${rel}: reads ${field} as an object`);
      }
    }

    expect(
      offenders,
      'serde-wasm-bindgen delivers a Rust HashMap as a JS Map, so Object.keys ' +
        'and Object.entries return nothing here — silently, and with the ' +
        'generated Record<> type agreeing. Use wireMapEntries from lib/wire-map.',
    ).toEqual([]);
  });

  it('has a helper that actually handles both shapes', async () => {
    // The rule above is only worth having if the alternative works. A helper
    // that only handled Map would be as wrong as Object.entries, in the other
    // direction — an older wire, or a test fixture, hands over a plain object.
    const { wireMapEntries } = await import('@/lib/wire-map');

    expect(wireMapEntries(new Map([['1', 'a']]), 'x')).toEqual([['1', 'a']]);
    expect(wireMapEntries({ 1: 'a' }, 'x')).toEqual([['1', 'a']]);
    expect(wireMapEntries(undefined, 'x')).toEqual([]);
    expect(wireMapEntries(null, 'x')).toEqual([]);
  });
});
