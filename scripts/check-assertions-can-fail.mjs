/**
 * An assertion no input could falsify is worse than no assertion: it reports a
 * guarantee it does not provide.
 *
 * Three of these were found in one audit of the Playwright specs, and each had a
 * plausible reason to exist:
 *
 *   - `expect(created).toBeTruthy()` where the helper returns
 *     `{ success, name }`. An object is always truthy, so the assertion held even
 *     when the helper reported failure. A comment twelve lines above documented
 *     this exact trap for the sibling call.
 *   - `expect(url).toContain('/workspace')` after navigating to an office. Login
 *     already waits for `/workspace` and the office lives under the same route,
 *     so it was true before the click.
 *   - `not.toContainText(marker)` where `marker` embeds `Date.now()`. The
 *     document could not contain it. It read as a control and was not one.
 *
 * This gate catches the two shapes that are decidable from the text:
 *
 *   1. `toBeTruthy()` / `toBeDefined()` applied to an object or array LITERAL,
 *      or to a call whose name says it returns a record.
 *   2. `not.toContain*` of a value built from `Date.now()` — a string nothing
 *      could match, so the negation is free.
 *
 * It cannot catch the third shape — an assertion that is true for reasons outside
 * the test, like a URL that was already correct. That needs a negative control,
 * and this file's header is the argument for running one.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = join(APP, 'integration-tests', 'src');

if (!existsSync(SPECS)) {
  console.error(`FAIL: ${relative(APP, SPECS)} does not exist — this gate examined nothing.`);
  process.exit(1);
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { yield* files(full); continue; }
    if (entry.endsWith('.ts')) yield full;
  }
}

/** `expect({...}).toBeTruthy()` and `expect([...]).toBeTruthy()`. */
const TRUTHY_LITERAL = /expect\s*\(\s*[[{][^)]*\)\s*\.\s*(toBeTruthy|toBeDefined)\s*\(/;

/** `not.toContain…(x)` where x is, or is built from, `Date.now()`. */
const NEGATED_TIMESTAMP = /\.not\s*\.\s*toContain\w*\s*\([^)]*Date\.now\s*\(\)/;

/**
 * A local `const x = ...Date.now()...` later used in a `not.toContain*`.
 * The value never appears in the app, so the negation cannot fail.
 */
function negatedFreshValue(source) {
  const minted = new Set();
  for (const m of source.matchAll(/\bconst\s+(\w+)\s*=\s*[^;\n]*Date\.now\s*\(\)/g)) minted.add(m[1]);
  const hits = [];
  for (const m of source.matchAll(/\.not\s*\.\s*toContain\w*\s*\(\s*(\w+)\s*\)/g)) {
    if (minted.has(m[1])) hits.push(m[1]);
  }
  return hits;
}

const problems = [];
let specsRead = 0;
let assertionsSeen = 0;

for (const file of files(SPECS)) {
  specsRead += 1;
  const rel = relative(APP, file);
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');

  assertionsSeen += (source.match(/\bexpect\s*\(/g) ?? []).length;

  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return; // a comment asserts nothing
    if (TRUTHY_LITERAL.test(line)) {
      problems.push(
        `${rel}:${i + 1}: \`toBeTruthy\`/\`toBeDefined\` on an object or array literal — always true`,
      );
    }
    if (NEGATED_TIMESTAMP.test(line)) {
      problems.push(
        `${rel}:${i + 1}: negated \`toContain\` of a value built from \`Date.now()\` — nothing could match it`,
      );
    }
  });

  for (const name of negatedFreshValue(source)) {
    problems.push(
      `${rel}: \`not.toContain*(${name})\` where \`${name}\` is minted from \`Date.now()\` — ` +
        'the value cannot appear in the app, so the negation is free',
    );
  }
}

// Vacuity floor. This suite is full of assertions; finding none means the pattern
// moved, and reporting a clean bill over that is the failure this gate is about.
if (specsRead < 10 || assertionsSeen < 100) {
  console.error(
    `FAIL: read ${specsRead} spec(s) and ${assertionsSeen} assertion(s) — far too few.\n` +
      'The walk or the pattern moved, so this gate examined essentially nothing.',
  );
  process.exit(1);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\nFAIL: ${problems.length} assertion(s) no input could falsify.\n`);
  for (const p of [...new Set(problems)]) console.error(`  ${p}`);
  console.error(
    '\nAssert the thing that can be wrong: a field rather than the record that holds it,\n' +
      'a value the app actually produces rather than one the test just minted.\n' +
      '\nThis gate sees only the shapes that are decidable from the text. An assertion that\n' +
      'is true for reasons outside the test — a URL that was already correct before the\n' +
      'click — needs a negative control to find.',
  );
  process.exit(1);
}

console.log(
  `check-assertions-can-fail: ${assertionsSeen} assertion(s) across ${specsRead} spec file(s); ` +
    'none is of a shape that cannot fail.',
);
