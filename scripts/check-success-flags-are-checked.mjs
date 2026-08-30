/**
 * A function that answers "did that work?" whose answer nobody reads.
 *
 * `sendAndAwaitAck` was changed to return a boolean precisely so an
 * unacknowledged RE-VFS operation would stop being invisible. Every one of its
 * six callers then awaited it, discarded it, and returned `Promise<void>` --
 * and so did the service, both hooks and the file-manager handlers above them.
 * `peerRmdir` went as far as writing `NOT acknowledged by peer` to a debug log
 * before returning void. The file manager announced "Deleted" for peers that
 * had never heard of the change.
 *
 * The same shape put a retracted P2P message back on screen after a reload: the
 * paginated store's write result was the only evidence the removal had not
 * happened, and nothing read it.
 *
 * Both were found by asking the type checker which call expressions resolve to
 * a boolean and are used as statements. This keeps asking.
 *
 * Only functions declared in THIS project count. `Map.delete`, `Set.delete` and
 * `classList.toggle` return booleans nobody is expected to read, and they
 * outnumber the real signal ten to one.
 *
 * Ratcheted: today's discards are recorded, a NEW one fails, and removing one
 * shrinks the file. Not every entry is a bug -- `requestResponse<true>` rejects
 * on failure, and the WASM send throws when no messenger handle exists -- but
 * every entry is a place where the only report of failure is being dropped, and
 * that is worth having to justify.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptsDir, '..');
const BASELINE = resolve(scriptsDir, 'discarded-success-flags.baseline.json');

const configPath = resolve(root, 'tsconfig.app.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();

const isBoolean = (type) => (type.flags & ts.TypeFlags.BooleanLike) !== 0;

/** `Promise<boolean>` and `boolean` are the same question asked twice. */
const unwrapPromise = (type) => {
  if (type.getSymbol()?.getName() === 'Promise') {
    const args = checker.getTypeArguments(type);
    if (args?.length === 1) return args[0];
  }
  return type;
};

const found = [];
for (const sourceFile of program.getSourceFiles()) {
  const file = sourceFile.fileName;
  if (!file.startsWith(`${root}/src`)) continue;
  // Tests discard results deliberately, to drive a path rather than judge it.
  if (file.includes('__tests__') || /\.test\.tsx?$/.test(file)) continue;

  const visit = (node) => {
    if (ts.isExpressionStatement(node)) {
      let expression = node.expression;
      if (ts.isAwaitExpression(expression)) expression = expression.expression;
      if (ts.isVoidExpression(expression)) {
        expression = expression.expression;
        if (ts.isAwaitExpression(expression)) expression = expression.expression;
      }
      if (ts.isCallExpression(expression)) {
        const signature = checker.getResolvedSignature(expression);
        const declaration = signature?.getDeclaration?.();
        const declaredIn = declaration?.getSourceFile?.().fileName ?? '';
        if (signature && declaredIn.startsWith(`${root}/src`)) {
          if (isBoolean(unwrapPromise(checker.getReturnTypeOfSignature(signature)))) {
            const callee = expression.expression;
            const name = ts.isPropertyAccessExpression(callee) ? callee.name.getText() : callee.getText();
            // Keyed by file and callee, NOT by line: a line number changes
            // whenever anything above it does, and a baseline that churns is a
            // baseline nobody reads.
            found.push(`${file.slice(root.length + 1)}::${name}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const counts = {};
for (const key of found.sort()) counts[key] = (counts[key] ?? 0) + 1;

if (!existsSync(BASELINE)) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.error(`  Success flags: recorded ${found.length} existing discard(s) -- commit the baseline  FAIL`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const added = [];
for (const [key, count] of Object.entries(counts)) {
  const allowed = baseline[key] ?? 0;
  if (count > allowed) added.push(`${key}  (${allowed} allowed, ${count} found)`);
}

if (added.length > 0) {
  console.error(`  Success flags: ${added.length} new discarded success flag(s)  FAIL`);
  for (const entry of added) console.error(`    ${entry}`);
  console.error('');
  console.error('  This call answers whether the operation worked and the answer is dropped.');
  console.error('  Either act on it -- report it, retry, or return it to a caller who can --');
  console.error('  or, if failure genuinely surfaces some other way (a throw, a rejection,');
  console.error('  an internal notification), say which in a comment at the call site.');
  process.exit(1);
}

const shrank = Object.keys(baseline).length !== Object.keys(counts).length ||
  Object.entries(baseline).some(([k, v]) => (counts[k] ?? 0) !== v);
if (shrank) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.error(`  Success flags: down to ${found.length} discard(s) -- baseline rewritten, commit it  FAIL`);
  process.exit(1);
}

console.log(`  Success flags: no new discarded success flags (${found.length} in the baseline)  ok`);
