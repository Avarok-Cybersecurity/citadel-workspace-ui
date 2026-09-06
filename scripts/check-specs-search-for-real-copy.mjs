/**
 * A spec may not search for words the app does not contain.
 *
 * Four rounds in a row were the same defect: a locator pinned to a label the
 * product improved. Each one cost a CI leg and read as something else entirely.
 *
 *   - `CONNECTED PEERS` -- the members list was given one noun, and from that
 *     day every P2P connection was reported as failed. Three sites.
 *   - `LIVE DOCS` / `Create Live Doc` -- `createLiveDoc` clicked nothing and
 *     honestly reported the document missing. The whole of test:live-doc.
 *   - `Edit MDX Content` -- the label became "Can edit MDX documents", and a
 *     375px layout guard stopped executing while its failure read as a broken
 *     test.
 *   - `Connect` -- the button says "Sign In". Three legs.
 *
 * None of these announces itself. A locator that matches nothing waits out its
 * timeout, or falls through to the next strategy, and the failure names the
 * feature rather than the string.
 *
 * The rule is not "never mention copy". Asserting that the UI SAYS something is
 * exactly right. The rule is that a string a spec searches for must exist in the
 * app, or be data the spec itself created, and the second case has to be said
 * out loud rather than assumed.
 *
 * WHAT THIS CANNOT SEE, stated plainly because a guard that overstates its reach
 * is worse than none:
 *
 *   1. WHICH SCREEN the string is on. It asks only whether the app contains it
 *      anywhere. `member-list-loading.spec.ts` searched the sidebar for
 *      "No members yet"; the sidebar has never said that, but `DirectoryTabContent`
 *      does, so this gate passed it — and the spec's one load-bearing assertion
 *      could not fail. Verified by control: restoring that exact locator today is
 *      still reported as clean. Only the testid check below catches it, because
 *      `members-empty` belongs to one component.
 *   2. Regex locators (`/No members yet/i`), which are not reconstructible here.
 *   3. `getByRole(..., { name })`, and attribute selectors like `#server`.
 *
 * 2 and 3 are open. They are the forms the suite increasingly prefers, so the
 * coverage here is narrower than the file name suggests.
 */
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(APP, 'src');
const SPECS = join(APP, 'integration-tests', 'src');

/**
 * Strings the suite searches for that the app legitimately does not contain,
 * each with the reason it is here. A string earns a place by somebody deciding
 * it belongs, not by nobody noticing.
 */
const CREATED_BY_THE_TEST = new Map([
  ['Test Alert 1', 'a notification the notification-center spec raises itself'],
  ['Test Alert 2', 'as above'],
  ['Test Alert 3', 'as above'],
  // Rendered from a server error message, not from a literal in this bundle.
  // The UI shows `err.message`, and the text is built by the Rust kernel --
  // `citadel-workspace-server-kernel/src/handlers/domain/core.rs:26` formats
  // "Permission denied: {msg}", and workspace_errors.rs:10 pins one such
  // constant. So this locator does match at runtime, and no amount of reading
  // the client can show that.
  //
  // Recorded rather than deleted BECAUSE it is unverifiable here: this gate
  // can prove a string is absent from the client, not that it is absent from
  // the screen. Saying so is the honest limit of what it measures.
  ['Permission denied', 'formatted by the server kernel, not present in the client bundle'],
]);

function filesUnder(dir, extensions) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(path);
  }
  return out;
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Comments stripped from the APP corpus too, not only from the specs.
//
// Without this a locator was satisfied by a sentence ABOUT the copy rather
// than the copy. Three passed that way, and one of them searched for text the
// app had deliberately REMOVED -- the only remaining occurrence of
// "Connected Peers" is a doc comment explaining that the label is gone.
//
// The whole point of this gate is that a locator matching nothing does not
// fail; it waits and falls through. A gate that a comment can satisfy has the
// same shape as the bug it is looking for.
const appText = filesUnder(SRC, ['.ts', '.tsx'])
  .filter((f) => !f.includes('__tests__') && !f.includes('.test.'))
  .map((f) => withoutComments(readFileSync(f, 'utf-8')))
  .join('\n');

const LITERAL = /(?:has-text|:text|getByText)\(\s*["'`]([^"'`]{3,40})["'`]|text=["']([^"']{3,40})["']/g;

/**
 * `getByTestId('x')`, and the constants specs hold one in.
 *
 * A testid is the form this gate RECOMMENDS as the fix for stale copy, and it was
 * the one form the gate could not check. `member-list-loading.spec.ts` searched
 * `getByText(/No members yet/i)` for a sidebar whose empty state has always read
 * "Nobody else is here yet" — so its single load-bearing assertion,
 * `expect(sawEmptyState).toBe(false)`, could not fail, and the loading fix it
 * guards could be reverted whole while it stayed green. Moving it to a testid is
 * only an improvement if the testid is checked too; otherwise it is the same
 * defect written more confidently.
 *
 * The regex form (`/No members yet/i`) that hid the original is still unparsed
 * here — noted, not fixed, because a regex can legitimately match copy this gate
 * cannot reconstruct. That is a real limit of this check and is written down
 * rather than implied.
 */
const TESTID = /getByTestId\(\s*["'`]([A-Za-z0-9_-]{2,60})["'`]\s*\)|TESTID(?:\w*)\s*(?::\s*string\s*)?=\s*["'`]([A-Za-z0-9_-]{2,60})["'`]/g;

/**
 * Every `data-testid` the app renders, in all four spellings it uses.
 *
 * The JSX attribute is the common one, but a testid is also passed as an OBJECT
 * PROPERTY when it is spread onto a child — `'data-testid': \`preview-region-${id}\``
 * in `components/theme/ThemePreview.tsx`. Reading only the attribute form made
 * this gate's first run accuse three specs of addressing `preview-region-sidebar`,
 * which the app renders perfectly well. A check that invents findings gets
 * disabled, and then it catches nothing at all.
 *
 * Templated ids contribute their literal PREFIX, so `preview-region-` admits
 * `preview-region-sidebar` without this gate having to evaluate the expression.
 */
const appTestIds = new Set();
/**
 * Prefixes are kept SEPARATE from complete ids, and only a prefix may be extended.
 *
 * The first version matched an id if it started with any known id, which meant a
 * real `members-empty` admitted `members-empty-nonexistent`. Its negative control
 * caught that: changing the spec's testid to a name the app has never rendered left
 * the gate reporting "ok". A check whose failure mode is "close enough" is the same
 * check that let the original stale locator through.
 */
const appTestIdPrefixes = new Set();
for (const m of appText.matchAll(/data-testid["']?\s*[=:]\s*["'`]([^"'`$]+)["'`]/g)) appTestIds.add(m[1]);
for (const m of appText.matchAll(/data-testid["']?\s*[=:]\s*\{?\s*`([^`$]*)/g)) if (m[1]) appTestIdPrefixes.add(m[1]);
// A `testId` PROP forwarded to `data-testid` by a wrapper — `CallControls.tsx`
// passes `testId="call-toggle-mic"` to a local `ToggleButton` whose JSX ends in
// `data-testid={testId}`. The rendered id is real; only the literal's spelling
// differs. Accepted because a wrapper is the normal way to keep an accessible
// button's markup in one place, and refusing it would push authors back to copy.
for (const m of appText.matchAll(/\btestId\s*=\s*["'`]([^"'`$]+)["'`]/g)) appTestIds.add(m[1]);
if (appTestIds.size === 0) {
  console.error('\n  FAIL: found no data-testid in the app at all — the corpus or the pattern moved.\n');
  process.exit(1);
}
/**
 * Exact match, or an extension of a TEMPLATED prefix (`preview-region-${id}`).
 * Nothing else: a complete id does not vouch for longer names built from it.
 */
const testIdExists = (id) =>
  appTestIds.has(id) || [...appTestIdPrefixes].some((prefix) => prefix.length > 0 && id.startsWith(prefix));

const findings = [];
let literalsSeen = 0;
let testIdsSeen = 0;
for (const file of filesUnder(SPECS, ['.ts'])) {
  const source = withoutComments(readFileSync(file, 'utf-8'));
  for (const match of source.matchAll(LITERAL)) {
    const literal = (match[1] ?? match[2] ?? '').trim();
    // Interpolated, or a selector rather than copy.
    if (!literal || literal.includes('$') || /^[.[#]/.test(literal)) continue;
    literalsSeen += 1;
    if (appText.includes(literal)) continue;
    if (CREATED_BY_THE_TEST.has(literal)) continue;
    findings.push(`${relative(APP, file)}: searches for ${JSON.stringify(literal)}`);
  }
  for (const match of source.matchAll(TESTID)) {
    const id = (match[1] ?? match[2] ?? '').trim();
    if (!id) continue;
    testIdsSeen += 1;
    if (testIdExists(id)) continue;
    findings.push(`${relative(APP, file)}: addresses data-testid ${JSON.stringify(id)}, which the app never renders`);
  }
}

// Vacuity floor. Either pattern silently ceasing to match would leave this gate
// reporting a clean suite over locators it never read — the exact shape of the
// defect it exists to find.
if (literalsSeen === 0 || testIdsSeen === 0) {
  console.error(
    `\n  FAIL: parsed ${literalsSeen} copy locator(s) and ${testIdsSeen} testid locator(s).\n` +
      '  A zero on either means the pattern stopped matching, not that the suite is clean.\n',
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error(`\n  ${findings.length} spec locator(s) search for words the app does not contain:\n`);
  for (const finding of [...new Set(findings)].slice(0, 20)) console.error(`    ${finding}`);
  console.error(
    '\n  Address the control by a data-testid, or -- if the string is data the\n' +
      '  spec itself created -- add it to CREATED_BY_THE_TEST with the reason.\n' +
      '  A locator that matches nothing does not fail; it waits, or falls through.\n',
  );
  process.exit(1);
}

console.log(
  `  Spec copy: ${literalsSeen} copy locator(s) and ${testIdsSeen} testid locator(s) across the suite ` +
    `all resolve against the app's ${appTestIds.size} testids  ok`,
);
