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
 *
 * A declaration ending in `as const` is exempt for the same reason, and a
 * stronger one: a const-assertion gives the binding the narrowest type the
 * value admits. There is no annotation that improves on it — every one is
 * either identical or wider, and writing it out duplicates the literal keys
 * and values, which is the SSOT violation the annotation was meant to prevent.
 * The gate exists because inference can drift when a value's shape changes
 * three modules away; here the value IS the type, so it cannot.
 *
 * A `cva(...)` declaration is exempt for the same reason, established by
 * trying both annotations that could work and watching each fail:
 *
 *   - `const alertVariants: (props?: VariantProps<typeof alertVariants> & …)`
 *     is TS2502, "referenced directly or indirectly in its own type
 *     annotation". The component's props are derived from the variants, so
 *     naming the type needs the type.
 *   - `const badgeVariants: ReturnType<typeof cva>` compiles, and erases the
 *     variant union: `VariantProps` of it is `{}`, and three call sites lose
 *     `variant` as a prop. It type-checks the declaration by breaking its
 *     consumers.
 *
 * The only remaining form spells the variant keys out by hand, at which point
 * `VariantProps<typeof x>` reads the annotation rather than the config and a
 * config change stops matching in silence — the exact drift this gate exists
 * to catch, pointed the other way.
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

/**
 * Whether the declaration reported at `line` ends in a const-assertion.
 *
 * Walks forward from the declaration balancing brackets and looks at the line
 * that closes it. Covers both the one-liner (`const A = 1 as const;`) and the
 * object/array literal spanning many lines.
 */
function isConstAssertion(lines, line) {
  let depth = 0;
  for (let i = line - 1; i < Math.min(lines.length, line + 500); i += 1) {
    for (const character of lines[i]) {
      if ('([{'.includes(character)) depth += 1;
      else if (')]}'.includes(character)) depth -= 1;
    }
    if (depth <= 0) return /\bas const\s*;?\s*$/.test(lines[i].replace(/\/\/.*$/, '').trim());
  }
  return false;
}

const results = await eslint.lintFiles(['src/**/*.ts', 'src/**/*.tsx']);

if (results.length < 100) {
  console.error(`\n  Linted only ${results.length} file(s) — the glob or the config moved.\n`);
  process.exit(1);
}

/** `{ 'src/x.ts': 3 }` — files with no findings are absent. */
const counts = {};
for (const result of results) {
  const source = readFileSync(result.filePath, 'utf-8').split('\n');
  const findings = result.messages.filter((message) => {
    if (!(message.ruleId in RULES)) return false;
    if (message.ruleId !== '@typescript-eslint/typedef') return true;
    if (/=\s*cva\(/.test(source[message.line - 1] ?? '')) return false;
    return !isConstAssertion(source, message.line);
  }).length;
  if (findings > 0) counts[relative(APP, result.filePath)] = findings;
}
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

if (WRITE) {
  // `--write` may LOWER a file's number and may not raise one.
  //
  // The first version wrote whatever it measured, and that is a ratchet with a
  // release lever on it: a pass that improved the total by 500 while quietly
  // regressing five files was accepted, because only the total was looked at.
  // Raising a number now needs `--allow-regressions`, which exists so that
  // doing it is a decision somebody made rather than a side effect of a bulk
  // edit.
  const previous = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf-8')) : {};
  const raised = Object.entries(counts).filter(([file, n]) => n > (previous[file] ?? 0));
  if (raised.length > 0 && !process.argv.includes('--allow-regressions')) {
    console.error(`\n  Refusing to write: ${raised.length} file(s) would go UP.\n`);
    for (const [file, n] of raised.slice(0, 10)) {
      console.error(`    ${file}: ${previous[file] ?? 0} → ${n}`);
    }
    console.error('\n  Fix them, or pass --allow-regressions if the increase is intended.\n');
    process.exit(1);
  }
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
