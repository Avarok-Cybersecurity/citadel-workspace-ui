/**
 * wasm-bindgen glue JS and its .wasm binary are coupled through export tables
 * and closure-shim indices. The glue is bundled into hashed app chunks and so
 * updates atomically with the precache; the binary sits at a STABLE url
 * (`/wasm/..._bg.wasm`), so its caching strategy alone decides whether the pair
 * matches.
 *
 * Under StaleWhileRevalidate the stale copy is served first and revalidated
 * behind it, so the very reload that applies an update pairs new glue with the
 * OLD binary. The symptom is not a clean error — every internal-service call
 * silently no-ops, so login and register do nothing, with no message and no
 * server-side log line.
 *
 * This reads the real vite config rather than a copy of the rule.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

/** The runtimeCaching entry whose urlPattern matches .wasm, comments stripped. */
function wasmRule(): string {
  const withoutComments = config.replace(/^\s*\/\/.*$/gm, '');
  const start = withoutComments.indexOf(".wasm')");
  expect(start, 'no runtimeCaching entry matches .wasm').toBeGreaterThan(-1);
  return withoutComments.slice(start, start + 600);
}

describe('the .wasm runtime caching rule', () => {
  it('never serves a cached binary ahead of the network', () => {
    const rule = wasmRule();

    // Both of these serve the cached copy FIRST, which is the defect.
    expect(rule).not.toMatch(/handler:\s*'StaleWhileRevalidate'/);
    expect(rule).not.toMatch(/handler:\s*'CacheFirst'/);
    expect(rule).toMatch(/handler:\s*'NetworkFirst'/);
  });

  it('still falls back to the cache, so an offline start works', () => {
    const rule = wasmRule();

    // NetworkFirst without a bound blocks startup on a captive or slow network.
    expect(rule).toMatch(/networkTimeoutSeconds:\s*\d+/);
    expect(rule).toMatch(/cacheName:\s*'citadel-wasm'/);
  });
});
