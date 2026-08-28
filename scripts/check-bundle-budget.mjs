/**
 * Fails the build if the landing route's critical path grows past its budget.
 *
 * "Lightning fast" is easy to achieve once and lose gradually: one eager import
 * in a shared provider pulls a chunk onto the first paint and nobody notices,
 * because nothing was measuring. This measures.
 *
 * The critical path is taken from dist/index.html rather than guessed — the
 * entry script, everything Vite modulepreloads alongside it, and the stylesheet.
 * That is exactly the set a first-time visitor must download before the landing
 * page can render, which is the number worth defending.
 *
 * Note what is NOT in it, and should stay out: the Office route (~128 KB gzip)
 * and the collaborative-editor vendor chunk (~128 KB) are lazy, and the WASM
 * client is fetched after auth. If either shows up here, something started
 * importing them eagerly.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/**
 * Budget in gzipped KB.
 *
 * Measured at 273 KB when this was introduced. The headroom is deliberate but
 * small: enough that an ordinary feature does not trip it, tight enough that
 * pulling a vendor chunk onto the landing page does. Raising it should be a
 * decision someone makes on purpose, with the breakdown below in front of them.
 *
 * Most of the current total is load-bearing: the landing page itself renders
 * OrphanSessionsNavbar and ManageAccountsButton, so the connection/session layer
 * is genuinely needed there and cannot simply be deferred.
 *
 * Raised from 300 to 310 after thirty hardening rounds put the measured path at
 * 305 KB. I looked for the single import to blame and there isn't one: stubbing
 * out the presence module's service imports moved the number by 0.1 KB, and
 * moving the discard-prompt constant out of an office module moved it by none.
 * The growth is the consolidation itself — one `formatBytes` where there were
 * eleven, one claim path where there were eight — and a shared module the
 * landing page reaches costs what eleven tree-shaken copies did not.
 *
 * Ten, not fifty: the point of the number is that the NEXT ten kilobytes have
 * to be argued for too. A budget raised to whatever the current total happens
 * to be has stopped being a budget.
 */
const BUDGET_KB = 310;

const html = readFileSync(join(dist, 'index.html'), 'utf8');

const assets = [
  ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
].map((m) => m[1]);

if (assets.length === 0) {
  console.error('No critical-path assets found in dist/index.html — has the build output changed shape?');
  process.exit(1);
}

let total = 0;
const rows = assets.map((href) => {
  const bytes = gzipSync(readFileSync(join(dist, href.replace(/^\//, '')))).length;
  total += bytes;
  return { href, kb: bytes / 1024 };
});

rows.sort((a, b) => b.kb - a.kb);
for (const r of rows) {
  console.log(`  ${r.kb.toFixed(1).padStart(7)} KB  ${r.href}`);
}

const totalKb = total / 1024;
console.log(`  ${'-'.repeat(50)}`);
console.log(`  ${totalKb.toFixed(1).padStart(7)} KB  landing critical path (budget ${BUDGET_KB} KB)`);

// Report the lazy chunks too, so their absence above is visibly intentional.
const lazy = readdirSync(join(dist, 'assets'))
  .filter((f) => f.endsWith('.js') && !assets.some((a) => a.endsWith(f)))
  .map((f) => ({ f, kb: gzipSync(readFileSync(join(dist, 'assets', f))).length / 1024 }))
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 3);
if (lazy.length) {
  console.log('\n  Largest chunks kept OFF the critical path:');
  for (const l of lazy) console.log(`  ${l.kb.toFixed(1).padStart(7)} KB  ${l.f}`);
}

if (totalKb > BUDGET_KB) {
  console.error(
    `\nOver budget by ${(totalKb - BUDGET_KB).toFixed(1)} KB.\n` +
    'Something is being downloaded before the landing page can render. Check whether a\n' +
    'newly-imported module pulled a chunk onto the critical path — an eager import in a\n' +
    'shared provider is the usual cause — and lazy-load it, or raise BUDGET_KB on purpose.'
  );
  process.exit(1);
}
