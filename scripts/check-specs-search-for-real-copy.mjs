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

const appText = filesUnder(SRC, ['.ts', '.tsx'])
  .filter((f) => !f.includes('__tests__') && !f.includes('.test.'))
  .map((f) => readFileSync(f, 'utf-8'))
  .join('\n');

const LITERAL = /(?:has-text|:text|getByText)\(\s*["'`]([^"'`]{3,40})["'`]|text=["']([^"']{3,40})["']/g;

const findings = [];
for (const file of filesUnder(SPECS, ['.ts'])) {
  const source = withoutComments(readFileSync(file, 'utf-8'));
  for (const match of source.matchAll(LITERAL)) {
    const literal = (match[1] ?? match[2] ?? '').trim();
    // Interpolated, or a selector rather than copy.
    if (!literal || literal.includes('$') || /^[.[#]/.test(literal)) continue;
    if (appText.includes(literal)) continue;
    if (CREATED_BY_THE_TEST.has(literal)) continue;
    findings.push(`${relative(APP, file)}: searches for ${JSON.stringify(literal)}`);
  }
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

console.log('  Spec copy: every searched string exists in the app  ok');
