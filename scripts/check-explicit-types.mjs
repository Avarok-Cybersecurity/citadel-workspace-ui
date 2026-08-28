/**
 * Every declaration carries a type, and the count can only go down.
 *
 * The policy: a TypeScript file in this repository is strongly typed —
 * `const storedSession: StoredSession = await …`, not `const storedSession =
 * await …`. Inference is convenient and it is also how a return type changes
 * shape three modules away and nothing says so; round 239 was exactly that, a
 * value read from one place and believed everywhere.
 *
 * ## Why a ratchet rather than a wall
 *
 * Turning the rules on outright fails 951 of 1087 files with 7,823 findings.
 * A gate nobody can pass is a gate that gets switched off, so this one holds a
 * per-file baseline: a file may not gain violations, a file not in the baseline
 * must have none, and any file that improves is rewritten down to its new
 * number. New code is fully typed from today; existing code burns down file by
 * file, and the baseline can only shrink.
 *
 * The baseline is a record of debt, not a permission slip. Its total is printed
 * on every run.
 *
 * ## What is required
 *
 * | rule | what it asks for |
 * |---|---|
 * | `typedef` (variableDeclaration, parameter, member/property) | `const x: T = …` |
 * | `explicit-function-return-type` | `function f(): T` |
 * | `explicit-module-boundary-types` | exported functions state what they return |
 * | `no-explicit-any` | already enforced outright in eslint.config.js |
 *
 * `arrowParameter` is deliberately NOT required: a callback passed to `.map()`
 * or to an event handler is contextually typed already, and annotating it
 * restates what the signature it is passed to has just said. Requiring it adds
 * 1,999 findings that make code longer without making it safer. `parameter` IS
 * required, so every named function's inputs are declared.
 *
 * `variableDeclarationIgnoreFunction` is on: `const f = (a: string): number =>
 * …` states its types in the signature, and demanding a second annotation on
 * the binding is noise.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { ESLint } from 'eslint';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = resolve(APP, 'scripts/explicit-types.baseline.json');
const WRITE = process.argv.includes('--write');

const RULES = {
  '@typescript-eslint/typedef': ['error', {
    variableDeclaration: true,
    memberVariableDeclaration: true,
    propertyDeclaration: true,
    parameter: true,
    arrowParameter: false,
    variableDeclarationIgnoreFunction: true,
  }],
  '@typescript-eslint/explicit-function-return-type': ['error', {
    allowExpressions: false,
    allowTypedFunctionExpressions: true,
    allowHigherOrderFunctions: true,
  }],
  '@typescript-eslint/explicit-module-boundary-types': 'error',
};

const eslint = new ESLint({
  cwd: APP,
  overrideConfigFile: resolve(APP, 'eslint.config.js'),
  overrideConfig: { rules: RULES },
});

const results = await eslint.lintFiles(['src/**/*.ts', 'src/**/*.tsx']);

if (results.length < 100) {
  console.error(`\n  Linted only ${results.length} file(s) — the glob or the config moved.\n`);
  process.exit(1);
}

/** `{ 'src/x.ts': 3 }` — files with no findings are absent. */
const counts = {};
for (const result of results) {
  const findings = result.messages.filter((message) => message.ruleId in RULES).length;
  if (findings > 0) counts[relative(APP, result.filePath)] = findings;
}
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

if (WRITE) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`  Baseline written: ${Object.keys(counts).length} file(s), ${total} finding(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('\n  No baseline. Run `npm run check:types -- --write` once to record the debt.\n');
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
const baselineTotal = Object.values(baseline).reduce((sum, n) => sum + n, 0);

const regressions = [];
const improvements = [];
for (const [file, found] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (found > allowed) {
    regressions.push(
      allowed === 0
        ? `${file}: ${found} declaration(s) without a type, in a file that had none`
        : `${file}: ${found} declaration(s) without a type, up from ${allowed}`,
    );
  } else if (found < allowed) {
    improvements.push(`${file}: ${allowed} → ${found}`);
  }
}
for (const file of Object.keys(baseline)) {
  if (!(file in counts)) improvements.push(`${file}: ${baseline[file]} → 0`);
}

if (regressions.length > 0) {
  console.error('\n  Declarations without a type:\n');
  for (const regression of regressions) console.error(`    ${regression}`);
  console.error(
    '\n  Annotate them. Every declaration states its type here -- see the header of' +
    '\n  scripts/check-explicit-types.mjs for what is required and why.\n',
  );
  process.exit(1);
}

if (improvements.length > 0) {
  // The ratchet only turns one way: an improvement is written in immediately, so
  // it cannot be given back later without failing.
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.error(`\n  ${improvements.length} file(s) improved and the baseline has been updated:\n`);
  for (const improvement of improvements.slice(0, 10)) console.error(`    ${improvement}`);
  if (improvements.length > 10) console.error(`    … and ${improvements.length - 10} more`);
  console.error(`\n  Total debt: ${baselineTotal} → ${total}. Commit the baseline.\n`);
  process.exit(1);
}

console.log(`  Explicit types: no new untyped declarations (${total} in the baseline, burning down)  ok`);
