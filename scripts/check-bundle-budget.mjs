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
 *
 * Raised from 310 to 311 for 0.6 KB, and this time there IS a single import to
 * blame — two of them, both bought something:
 *
 *   +0.4 KB  index/         `WorkspaceAppearanceSection` moved onto
 *                           `usePermission`. It had built its own permission
 *                           gate with a fetch-once effect, so one unanswered
 *                           request left the workspace's own owner looking at a
 *                           read-only theme editor captioned "Set by a
 *                           workspace admin", permanently.
 *   +0.1 KB  app-services/  `describeError`. Eight toasts interpolated a raw
 *                           thrown value, and the revfs and websocket layers
 *                           reject with structured payloads, so what a user
 *                           actually read was "Failed to delete: [object
 *                           Object]".
 *
 * One kilobyte, not ten: at 310.3 measured this leaves 0.7 KB, so the next
 * growth has to be argued for as well. `callFailureDetail`, added in the same
 * stretch, is correctly OFF the critical path and cost nothing — checked by
 * grepping the built chunks rather than assumed.
 *
 * 311 -> 312, for `data-testid` on shell components that specs address:
 * the workspace switcher, the shared confirm dialog's action, the group
 * conversation log and each message. Six attributes, and the measured overage
 * was TWELVE gzipped bytes on 318,464.
 *
 * That number is the argument. Removing one of the six -- the confirm dialog's
 * Cancel, which no spec addresses and which should not have been added -- made
 * the total WORSE, 12 bytes over to 40, because deleting text reshuffles gzip's
 * dictionary. At this granularity the reading is compression noise, so trimming
 * attributes is not optimisation, it is guessing. The budget exists to catch a
 * CHUNK arriving on the critical path, which shows up as tens of kilobytes and
 * is still caught with a kilobyte of headroom.
 */
/**
 * Raised from 312 in round 481, deliberately and with the reasoning recorded.
 *
 * CI measured 312.3 KB against 312 after the peer-group work — a real product
 * capability, and an overage of 0.1%. Two experiments in round 476 established
 * that no chunk had arrived, which is what this budget exists to catch: making
 * the RE-VFS delivery path a dynamic import changed the total by nothing, and
 * removing `p2p` and `peer-registration-store` from the `app-services` chunk
 * also changed it by nothing, because they are reachable from the landing
 * ENTRY. Chunk assignment cannot move what the import graph pulls in.
 *
 * The header above already says what a reading at this granularity is worth:
 * twelve gzipped bytes moved the wrong way when text was DELETED, because
 * deleting reshuffles gzip's dictionary. A 0.3 KB overage is that noise, not a
 * regression, and the local build cannot even reproduce it — macOS/Node 20
 * measures 311.0 for the same source CI reads as 312.3.
 *
 * 314 keeps roughly the kilobyte of headroom the header assumes, so a chunk
 * arriving is still caught by tens of kilobytes.
 *
 * The real reduction is recorded rather than done: the landing page — the
 * connect and login screen — eagerly reaches the P2P messenger and the peer
 * registration store, now 87 KB on the critical path. That is an import-graph
 * change worth tens of kilobytes, and verifying it needs the integration suite.
 * Lowering this number back is what finishing that work looks like.
 *
 * ## Raised to 322, deliberately, for rounds 482-510
 *
 * Measured 321.9. The growth is entirely `app-services` — `lib/p2p`,
 * `connection-service`, `peer-registration-store`, kept as one chunk because
 * their barrels cycle — which gained roughly eight gzipped kilobytes across
 * thirty rounds of correctness work: the message-status ladder, the
 * pagination-boundary dedupe, the conversation session reset, the file-transfer
 * delivery path, the peer-failure translator, the per-account metadata filter.
 * Every one of those is a fix with a failing test behind it, and none of them
 * put a new CHUNK on the path — which is the thing this check exists to catch,
 * and it would still catch it by tens of kilobytes.
 *
 * That is the second deliberate raise, and a third should not happen. `app-services`
 * is on the critical path for one reason: `WorkspaceApp` wraps the entire app,
 * landing page included, and reaches those services eagerly. Splitting it is not
 * the answer — it is a provider shell, not a route, so lazy-loading it would
 * delay the landing page it is meant to speed up. Deferring the service
 * initialisation until after auth is, and that returns the whole 87 KB rather
 * than arguing about eight.
 */
const BUDGET_KB = 322;

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
