/**
 * wasm-bindgen glue JS and its .wasm binary are coupled through export tables
 * and closure-shim indices. Serve one generation's glue against another's
 * binary and every internal-service call silently no-ops — login and register
 * do nothing, with no message and no server-side log line.
 *
 * The glue lives in hashed app chunks, which the precache versions atomically.
 * So the binary's caching decides whether the pair matches, and this repo has
 * now shipped every wrong answer to that question:
 *
 *   CacheFirst              old binary, new glue, for up to thirty days
 *   StaleWhileRevalidate    the very reload applying an update pairs new glue
 *                           with the previous binary
 *   NetworkFirst            with registerType 'prompt', the OLD worker keeps
 *                           serving OLD glue while the network hands it the NEW
 *                           binary — so every launch between a deploy and the
 *                           user clicking Reload runs a mismatched pair, and
 *                           the mismatched binary poisons the cache for offline
 *                           starts too
 *
 * Each fix corrected the previous direction and opened another, because all
 * three answer from a generation independent of the precache. The binary is now
 * precached WITH the glue, so both halves are revisioned by the same worker and
 * there is no window in which a page holds one of each.
 *
 * This reads the real vite config rather than a copy of the rule.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

/** The config with `//` comments stripped, so prose cannot satisfy a check. */
const code = config.replace(/^\s*\/\/.*$/gm, '');

describe('the WASM binary', () => {
  it('is precached, so it is versioned with the glue that calls it', () => {
    const globPatterns = code.match(/globPatterns:\s*\[([^\]]*)\]/);
    expect(globPatterns, 'no globPatterns in the workbox config').not.toBeNull();
    expect(
      globPatterns![1],
      'the binary must be precached — every strategy that answers from a ' +
        'generation independent of the precache splits it from its glue',
    ).toMatch(/wasm/);
  });

  it('is not excluded from the precache', () => {
    const globIgnores = code.match(/globIgnores:\s*\[([^\]]*)\]/);
    expect(globIgnores).not.toBeNull();
    expect(
      globIgnores![1],
      'excluding all .wasm is what made the pair splittable in the first place',
    ).not.toMatch(/\*\*\/\*\.wasm|'\*\.wasm'/);
  });

  it('has no runtime-caching rule racing the precache', () => {
    const runtime = code.slice(code.indexOf('runtimeCaching:'));
    const rules = runtime.slice(0, runtime.indexOf('devOptions'));
    expect(
      rules,
      'a runtime rule answers from its own generation, which is exactly how ' +
        'the glue and the binary came apart three times',
    ).not.toMatch(/\.wasm/);
  });

  it('fits under the per-file precache cap', () => {
    const cap = code.match(/maximumFileSizeToCacheInBytes:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
    expect(cap, 'no maximumFileSizeToCacheInBytes — the binary would be dropped').not.toBeNull();

    // Silently dropping the binary from the precache reinstates the split
    // without changing a single line of the strategy.
    const binary = join(process.cwd(), 'public/wasm/citadel_internal_service_wasm_client_bg.wasm');
    const bytes = readFileSync(binary).byteLength;
    expect(bytes, 'the binary is larger than the precache cap').toBeLessThan(
      Number(cap![1]) * 1024 * 1024,
    );
  });
});
