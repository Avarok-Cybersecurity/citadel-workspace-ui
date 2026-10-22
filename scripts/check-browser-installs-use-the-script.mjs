/**
 * Every browser install in CI goes through scripts/ci/install-chromium.sh.
 *
 * The install was written inline, step by step, and each fix reached only some of the copies.
 * A retry went into three parent steps while three UI steps shipped without one. A wait for
 * the dpkg lock went into six steps; a seventh, added later for the geometry gates, copied an
 * older block with no wait and a 300s bound. On 2026-10-22 that step ("UI sweep geometry",
 * UI run 39831695758, and its rerun) died twice on
 *   E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 2787 (apt-get)
 * One script, and this check that nothing installs a browser beside it, is what stops the
 * next copy.
 *
 * Usage: node scripts/check-browser-installs-use-the-script.mjs <repo-root>
 * It reads <repo-root>/.github/workflows/*.yml and <repo-root>/.github/actions/* /action.yml.
 * The UI runs it on itself (`npm run check:browser-installs`); the parent runs it on the
 * parent's root, from citadel-workspaces/.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = 'scripts/ci/install-chromium.sh';
const UI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INLINE = /playwright\s+install/;
const CALL = /(^|[\s;&|])bash\s+(citadel-workspaces\/)?scripts\/ci\/install-chromium\.sh(\s|$)/;

if (process.argv.length !== 3) {
  console.error('usage: check-browser-installs-use-the-script.mjs <repo-root>');
  process.exit(64);
}
const root = resolve(process.argv[2]);
if (!existsSync(join(UI_ROOT, SCRIPT))) {
  console.error(`FAIL: ${SCRIPT} is missing, so every call this check requires would fail.`);
  process.exit(1);
}

function yamlFiles() {
  const files = [];
  const workflows = join(root, '.github', 'workflows');
  if (!existsSync(workflows)) {
    console.error(`FAIL: ${workflows} does not exist; pass the repository root.`);
    process.exit(1);
  }
  for (const f of readdirSync(workflows)) if (/\.ya?ml$/.test(f)) files.push(join(workflows, f));
  const actions = join(root, '.github', 'actions');
  if (existsSync(actions)) {
    for (const a of readdirSync(actions)) {
      for (const f of ['action.yml', 'action.yaml']) {
        if (existsSync(join(actions, a, f))) files.push(join(actions, a, f));
      }
    }
  }
  return files;
}

const files = yamlFiles();
const problems = [];
let calls = 0;
for (const file of files) {
  const rel = relative(root, file);
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/(^|\s)#.*$/, '').trim();
    if (!code) return;
    if (CALL.test(code)) calls += 1;
    if (INLINE.test(code)) problems.push(`${rel}:${i + 1}: ${code.slice(0, 100)}`);
  });
}

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::inline browser install -- ${p}`);
  console.error(
    `\nFAIL: ${problems.length} line(s) install a browser beside ${SCRIPT}.\n` +
      'Replace the block with `bash scripts/ci/install-chromium.sh` (UI workflow, from\n' +
      'citadel-workspaces/) or `bash citadel-workspaces/scripts/ci/install-chromium.sh` (from\n' +
      'the parent root). It waits for the dpkg lock before every attempt; an inline copy is how\n' +
      'a step came to have no wait at all.',
  );
  process.exit(1);
}
if (calls === 0) {
  // Both repositories install Chromium in CI. None found means the call shape changed and
  // this check stopped recognising it -- not that the browsers stopped being installed.
  console.error(`FAIL: no \`bash .../${SCRIPT}\` call in ${files.length} file(s) under ${root}.`);
  process.exit(1);
}
console.log(
  `check-browser-installs-use-the-script: ${calls} install(s) through ${SCRIPT}, ` +
    `no inline install, across ${files.length} workflow/action file(s)`,
);
