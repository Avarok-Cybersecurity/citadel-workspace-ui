/**
 * A gate that rewrites its own baseline, left uncommitted, stops being a gate.
 *
 * Three checks here ratchet against a baseline file and REWRITE that file in
 * the working tree when the count improves, then exit 1 asking for the new
 * count to be committed. That works exactly once. The first local run fails
 * loudly; every run after it compares against the rewritten file and passes,
 * while CI keeps comparing against the committed one and keeps failing.
 *
 * It has happened three times in this tree. The last was round 455: a spec
 * swapped a copy-addressed press for a testid, 132 became 131, the baseline was
 * rewritten and never staged, and the local preflight said "all checks passed"
 * for three more rounds while CI failed on it.
 *
 * The leftover is mechanically visible -- a tracked baseline with unstaged
 * changes -- so this reports it as its own failure instead of leaving it to be
 * discovered in a red run. In CI the checkout is clean, so this passes unless a
 * gate actually rewrote something, which is the same condition.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, '..');

// The baselines are discovered, not listed. A list here would be a second copy
// of a fact the filenames already carry, and the next self-writing gate would
// be added without it.
const baselines = readdirSync(scriptsDir)
  .filter((f) => f.endsWith('.baseline.json'))
  .map((f) => `scripts/${f}`)
  .sort();

if (baselines.length === 0) {
  console.error('  Baselines committed: no *.baseline.json found under scripts/ -- has this check gone stale?  FAIL');
  process.exit(1);
}

const git = (args) =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

// Both halves matter: an unstaged rewrite, and one staged but not committed.
const dirty = git(['diff', 'HEAD', '--name-only', '--', ...baselines])
  .split('\n')
  .filter(Boolean);

if (dirty.length > 0) {
  console.error(
    `  Baselines committed: ${dirty.length} ratcheting baseline(s) differ from HEAD  FAIL`,
  );
  for (const file of dirty) {
    const before = git(['show', `HEAD:${file}`]);
    const after = existsSync(resolve(repoRoot, file))
      ? git(['diff', 'HEAD', '--numstat', '--', file])
      : '(deleted)';
    console.error(`    ${file}  (${after.split('\t').slice(0, 2).join(' +/- ')} lines, HEAD has ${before.length} bytes)`);
  }
  console.error('');
  console.error('  A gate rewrote its baseline in the working tree. Local runs now compare');
  console.error('  against the rewrite and pass; CI compares against the commit and fails.');
  console.error('  Commit the baseline as part of the change that improved it.');
  process.exit(1);
}

console.log(
  `  Baselines committed: all ${baselines.length} ratcheting baseline(s) match HEAD  ok`,
);
