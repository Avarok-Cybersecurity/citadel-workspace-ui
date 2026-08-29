/**
 * Write down the types the explicit-types gate is asking for, and only those.
 *
 * `annotate-types.mjs` walks the AST and annotates everything it can. On its
 * first run against `src/lib/utils` that was 52 edits for **one** finding: the
 * gate exempts a contextually-typed function expression, and the annotator did
 * not know that, so fifty-one edits were churn in files nobody had complained
 * about.
 *
 * This one is driven by the findings themselves. ESLint says where, the
 * compiler says what, and every edit therefore removes exactly one finding. It
 * also means the two can never disagree about what counts.
 *
 * The refusals from the original still apply and are the substance:
 *
 *  - a literal type is widened (`const RETRIES = 2` is `number`, not `2`),
 *    because writing the literal narrows the constant and every caller passing
 *    a different number stops compiling;
 *  - `boolean` on a variable is refused, because since TS 4.4 a `const` holding
 *    a condition narrows what it tested, and an annotation discards that;
 *  - anything needing an import it cannot see is refused, because a codemod
 *    that adds imports breaks builds;
 *  - a parenthesis-less arrow (`value => ...`) is skipped, because there is
 *    nowhere to put a return type without rewriting the parameter list.
 *
 * Usage: node scripts/annotate-from-findings.mjs [pathPrefix] [--dry] [--limit N]
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const limitAt = args.indexOf('--limit');
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const prefix = args.find((a) => !a.startsWith('--') && a !== String(LIMIT)) ?? 'src';

const RULES = {
  '@typescript-eslint/typedef': ['error', {
    variableDeclaration: true, memberVariableDeclaration: true,
    propertyDeclaration: true, parameter: true, arrowParameter: false,
    variableDeclarationIgnoreFunction: true,
  }],
  '@typescript-eslint/explicit-function-return-type': ['error', {
    allowExpressions: false, allowTypedFunctionExpressions: true, allowHigherOrderFunctions: true,
  }],
  '@typescript-eslint/explicit-module-boundary-types': 'error',
};

const eslint = new ESLint({
  cwd: APP,
  overrideConfigFile: resolve(APP, 'eslint.config.js'),
  overrideConfig: { rules: RULES },
  // A directory with no .tsx in it is not an error; it is a directory.
  errorOnUnmatchedPattern: false,
});

const results = await eslint.lintFiles([prefix]);

/** file -> [{ line, column }] */
const wanted = new Map();
for (const result of results) {
  const findings = result.messages.filter((m) => m.ruleId in RULES);
  if (findings.length > 0) wanted.set(result.filePath, findings);
}

const configPath = ts.findConfigFile(APP, ts.sys.fileExists, 'tsconfig.app.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, APP);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

let annotated = 0;
let touched = 0;

for (const source of program.getSourceFiles()) {
  if (source.isDeclarationFile) continue;
  const findings = wanted.get(source.fileName);
  if (!findings) continue;
  if (annotated >= LIMIT) break;

  /**
   * The LINES ESLint pointed at.
   *
   * Not exact offsets: `typedef` reports the whole declaration and
   * `explicit-function-return-type` the function, so column-exact matching
   * found 686 of 5,528 findings. A line is precise enough to pick the right
   * node and forgiving enough to find it, and `tsc` is what says whether the
   * result is right.
   */
  const lines = new Set(findings.map((f) => f.line));
  const onWantedLine = (node) =>
    lines.has(ts.getLineAndCharacterOfPosition(source, node.getStart(source)).line + 1);

  const edits = [];
  const visit = (node) => {
    if (annotated + edits.length >= LIMIT) return;

    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      !node.type && node.body && onWantedLine(node)
    ) {
      const signature = checker.getSignatureFromDeclaration(node);
      if (signature) {
        const printed = checker.typeToString(
          checker.getReturnTypeOfSignature(signature), node,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
        );
        if ((isSafe(printed, source) || printed === 'JSX.Element') && printed !== 'any') {
          const insertAt = ts.isArrowFunction(node)
            ? node.equalsGreaterThanToken.getFullStart()
            : node.body.getFullStart();
          if (!ts.isArrowFunction(node) || source.getFullText().slice(0, insertAt).trimEnd().endsWith(')')) {
            edits.push({ position: insertAt, text: `: ${printed}` });
          }
        }
      }
    }

    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      !node.type && ts.isIdentifier(node.name) && onWantedLine(node)
    ) {
      // NOT widened. `getBaseTypeOfLiteralType` turns `const CODEC =
      // 'av01.0.05M.08'` into `string`, and every call site expecting the
      // literal union stops compiling -- 30-odd errors on the first full run.
      // Writing the literal instead narrows a numeric constant so that callers
      // passing a different number stop compiling, which is the same failure
      // from the other side.
      //
      // Both directions break, so literal-typed declarations are left alone.
      // They are the one class this tool cannot decide, because the answer
      // depends on how the value is USED and not on what it is.
      const type = checker.getTypeAtLocation(node);
      const printed = checker.typeToString(
        type, node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
      );
      if (isSafe(printed, source)) edits.push({ position: node.name.getEnd(), text: `: ${printed}` });
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  if (edits.length === 0) continue;
  touched += 1;
  annotated += edits.length;
  if (DRY) continue;

  let text = readFileSync(source.fileName, 'utf-8');
  for (const edit of edits.sort((a, b) => b.position - a.position)) {
    text = text.slice(0, edit.position) + edit.text + text.slice(edit.position);
  }
  writeFileSync(source.fileName, text);
}

function isSafe(printed, source) {
  if (printed.length > 60) return false;
  if (/\bimport\(|typeof import|\{|\}|=>|any\b|error\b/.test(printed)) return false;
  if (/^(any|unknown|never|null|undefined)$/.test(printed)) return false;
  if (/^["'`]/.test(printed) || /^-?\d/.test(printed) || /^(true|false)$/.test(printed)) return false;
  if (printed === 'boolean') return false;
  const names = printed.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  const BUILTIN = new Set([
    'string', 'number', 'boolean', 'void', 'bigint', 'symbol', 'object', 'true', 'false',
    'Array', 'Promise', 'Map', 'Set', 'Record', 'Date', 'RegExp', 'Error', 'Uint8Array',
    'ArrayBuffer', 'Blob', 'File', 'FormData', 'URL', 'AbortController', 'readonly',
  ]);
  const text = source.getFullText();
  return names.every((name) =>
    BUILTIN.has(name) ||
    new RegExp(`\\b(import[^;]*\\b${name}\\b|(interface|type|class|enum)\\s+${name}\\b)`).test(text));
}

console.log(`${DRY ? 'Would annotate' : 'Annotated'} ${annotated} finding(s) across ${touched} file(s) under ${prefix}.`);
