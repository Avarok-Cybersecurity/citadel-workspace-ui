/**
 * The vendored cdoc-wasm is one fresh pair. scripts/sync-cdoc-wasm.sh writes the binary, the
 * glue and PROVENANCE.json in one run; a binary or glue changed by anything else (a hand copy,
 * a merge that took one side, a stale rebuild) no longer matches the hashes recorded beside it,
 * and a glue from one build against a binary from another fails at instantiation or calls the
 * wrong export. The glue must also load the binary from its stable, precached URL.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CDOC_FONT_BASE_URL, CDOC_WASM_URL } from '../asset-urls';
import { FONT_MANIFEST } from '../generated/font-manifest';

const UI: string = process.cwd();
const GENERATED: string = join(UI, 'vendor/cdoc');
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const publicPath = (url: string): string => join(UI, 'public', url);

interface Provenance {
  citadel_docs_commit: string;
  wasm_bindgen_version: string;
  wasm_opt_version: string;
  wasm_sha256: string;
  wasm_bytes: number;
  glue_sha256: string;
  dts_sha256: string;
}
const provenance: Provenance = JSON.parse(readFileSync(join(GENERATED, 'PROVENANCE.json'), 'utf8')) as Provenance;

describe('the vendored cdoc-wasm pair', () => {
  it('names the citadel-docs commit and tool versions it was built with', () => {
    expect(provenance.citadel_docs_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance.wasm_bindgen_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(provenance.wasm_opt_version).toMatch(/^\d+$/);
  });

  it('has the binary PROVENANCE recorded', () => {
    const binary: string = publicPath(CDOC_WASM_URL);
    expect(sha256(binary), 'public/cdoc changed without re-running scripts/sync-cdoc-wasm.sh').toBe(provenance.wasm_sha256);
    expect(statSync(binary).size).toBe(provenance.wasm_bytes);
  });

  it('has the glue and declarations PROVENANCE recorded', () => {
    expect(sha256(join(GENERATED, 'cdoc_wasm.js')), 'the glue changed without re-running the sync').toBe(provenance.glue_sha256);
    expect(sha256(join(GENERATED, 'cdoc_wasm.d.ts'))).toBe(provenance.dts_sha256);
  });

  it('loads the binary from its stable /cdoc/ URL, never relative to the glue', () => {
    const glue: string = readFileSync(join(GENERATED, 'cdoc_wasm.js'), 'utf8');
    expect(CDOC_WASM_URL.startsWith('/cdoc/')).toBe(true);
    expect(glue).toContain(`module_or_path = ${JSON.stringify(CDOC_WASM_URL)};`);
    expect(glue).not.toContain('import.meta.url');
  });
});

describe('the vendored faces', () => {
  it.each(FONT_MANIFEST.faces.map((f) => [f.file, f.sha256] as const))('%s is the file the manifest pins', (file: string, sha: string) => {
    expect(sha256(publicPath(`${CDOC_FONT_BASE_URL}${file}`))).toBe(sha);
  });

  it('ship with their licence', () => {
    expect(readFileSync(publicPath(`${CDOC_FONT_BASE_URL}${FONT_MANIFEST.licenseFile}`), 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(FONT_MANIFEST.license).toBe('OFL-1.1');
  });
});
