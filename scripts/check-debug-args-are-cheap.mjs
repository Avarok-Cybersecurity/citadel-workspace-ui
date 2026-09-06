/**
 * A log line that costs nothing to print must cost nothing to build.
 *
 * `debugLog` is `noop` when `import.meta.env.DEV` is false, but JavaScript
 * evaluates its ARGUMENTS at the call site regardless. So
 * `debugLog('x', fnv1a64(bytes))` hashed every byte of every inbound P2P
 * message in production and handed the result to a function that discards it.
 * `fnv1a64` is a BigInt loop -- three BigInt operations per byte -- and the
 * inline transfer cap is 16 MiB, so one large file cost close to a second of
 * main-thread time at a single call site, for no output.
 *
 * The same shape appeared four more times: a per-forward payload fingerprint,
 * two whole-object `JSON.stringify`s (one of them on a 30-second poll), and a
 * settings dump.
 *
 * The fix is a call-site guard, not a thunk API: `if (debugEnabled) debugLog(…)`
 * is a constant condition in the production bundle, so Rollup removes the
 * branch entirely. The ~1100 call sites that pass strings need no guard and do
 * not get one -- this only constrains arguments that do real work.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * Calls that are too expensive to make for a logger that may discard them.
 *
 * A denylist rather than a general "any call expression" rule: plenty of cheap
 * accessors appear in log arguments and forbidding all of them would be noise
 * nobody could act on.
 */
const EXPENSIVE = /\b(fnv1a64|sha256Sync|describeForwarded|JSON\.stringify)\s*\(/;

/** Log functions that are compiled away, so their arguments are wasted work. */
const NOOP_IN_PROD = /\b(debugLog|warnLog)\s*\(/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full;
  }
}

const problems = [];
let logCalls = 0;
let guarded = 0;

for (const file of walk(SRC)) {
  // Comments blanked, not removed, so reported line numbers stay true.
  //
  // The first run of this gate flagged its own explanation: `debug-config.ts`
  // documents the hazard with a literal `debugLog('x', fnv1a64(bytes))`, and a
  // raw-text scan cannot tell an example from a call. That is the same defect
  // this repository has now found four times -- a check satisfied by prose --
  // and writing it again while building a gate against a different defect is
  // the reason the rule is worth stating: a gate must read CODE.
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line));

  lines.forEach((line, i) => {
    if (!NOOP_IN_PROD.test(line)) return;
    logCalls += 1;
    if (!EXPENSIVE.test(line)) return;

    // The guard may be on this line or just above it — an `if (debugEnabled) {`
    // block opened up to three lines earlier still encloses this call.
    const window = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    if (/\bif\s*\(\s*debugEnabled\s*\)/.test(window)) { guarded += 1; return; }

    problems.push(`${relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}

if (logCalls === 0) {
  console.error('FAIL: no debugLog/warnLog call sites found — this gate is inert and would pass by considering nothing.');
  process.exit(1);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`::error file=${p.split(':')[0]}::${p}`);
  console.error(`\nFAIL: ${problems.length} log call(s) build an expensive argument that production throws away.\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nWrap the call site:\n' +
      '    if (debugEnabled) debugLog(...);\n\n' +
      'debugLog is a noop in production, but its ARGUMENTS are still evaluated.\n' +
      'Rollup removes an `if (debugEnabled)` branch from the production bundle,\n' +
      'so the guard costs nothing.',
  );
  process.exit(1);
}

console.log(
  `check-debug-args-are-cheap: ${logCalls} log call site(s) scanned, ${guarded} carrying ` +
    'expensive arguments and all of them guarded.',
);
