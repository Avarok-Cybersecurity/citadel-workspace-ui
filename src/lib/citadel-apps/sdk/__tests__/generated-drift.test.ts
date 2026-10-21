// @vitest-environment node
/**
 * The host consumes a COPY of the SDK's generated bindings (ts-rs output and AbiConstants.ts), so
 * the UI builds without the Rust tree. This holds the copy to its source byte for byte, in both
 * directions: a binding changed, added or removed upstream fails here until it is re-copied.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BINDINGS, GENERATED_COPY } from './sdk-paths';

const tsFiles = (dir: string): string[] => readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort();

describe(`the generated SDK bindings copy (source: ${BINDINGS.label})`, () => {
  it.skipIf(!BINDINGS.present)('names exactly the files the source has', () => {
    expect(tsFiles(GENERATED_COPY)).toEqual(tsFiles(BINDINGS.path));
  });

  it.skipIf(!BINDINGS.present)('every file equals its source byte for byte', () => {
    const differ: string[] = tsFiles(BINDINGS.path).filter((f: string) =>
      !readFileSync(join(GENERATED_COPY, f)).equals(readFileSync(join(BINDINGS.path, f))));
    expect(differ).toEqual([]);
  });

  it('the copy is present and carries the ABI constants', () => {
    expect(tsFiles(GENERATED_COPY)).toContain('AbiConstants.ts');
  });
});
