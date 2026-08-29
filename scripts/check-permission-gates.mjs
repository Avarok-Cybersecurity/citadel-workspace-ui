/**
 * A control's enabled state comes from `usePermission`, not from `hasPermission`.
 *
 * `usePermission` carries three things that took a round each to get right: a
 * bounded retry, so one fetch that came back empty during start-up does not
 * refuse a control for the life of the page; a reset on reconnection and on a
 * session change, so a budget spent too early is spent again at the moment the
 * answer may differ; and a reason that distinguishes "the answer was no" from
 * "we never got an answer", which is the difference between a permission to
 * request and a fault to report.
 *
 * `hasPermission` from `usePermissions()` has none of them. It reads the cache,
 * and a domain nobody loaded reads exactly like a denial.
 *
 * `WorkspaceAppearanceSection` gated on it behind its own fetch-once effect,
 * and so the workspace's own owner could be shown a read-only theme editor
 * captioned "Set by a workspace admin", permanently, because one request went
 * out before the tab knew who was signed in. Every part of that already had a
 * fix. It was the second gate, and it had inherited none of them.
 *
 * So: reading permission state to DISPLAY it is fine — a permission matrix has
 * to render what the cache holds. Reading it to decide whether a control works
 * is not, and any file that needs to must say why here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { globSync } from 'node:fs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Files that read permission state directly, and why that is not a gate.
 * Adding one is a decision, not a formality: say what it renders.
 */
const DISPLAYS_RATHER_THAN_GATES = new Map([
  [
    'src/components/settings/PermissionWidgets.tsx',
    'renders the permission matrix itself — the cache IS the subject, not an input to a decision',
  ],
]);

const CALLS = /\b(hasPermission|hasAnyPermission|hasAllPermissions)\s*\(/;

const files = globSync('src/**/*.{ts,tsx}', { cwd: APP })
  .filter((f) => !f.includes('__tests__') && !f.includes('.test.'))
  // The mechanism itself, and the context that exposes it.
  .filter((f) => !f.startsWith('src/hooks/use-permission') && !f.startsWith('src/lib/permissions-service/'))
  .filter((f) => f !== 'src/contexts/PermissionsContext.tsx');

const offenders = [];
for (const file of files) {
  const source = readFileSync(resolve(APP, file), 'utf-8');
  if (!CALLS.test(source)) continue;
  if (DISPLAYS_RATHER_THAN_GATES.has(file)) continue;
  offenders.push(file);
}

if (offenders.length > 0) {
  console.error('\n  Permission gates must go through usePermission:\n');
  for (const file of offenders) {
    console.error(`::error file=citadel-workspaces/${file}::${relative('src', file)} reads permission state directly`);
  }
  console.error(
    '\n  usePermission carries the retry, the reset-on-reconnect and the "we never\n' +
    '  got an answer" reason. hasPermission has none of them, and a domain nobody\n' +
    '  loaded reads exactly like a denial.\n\n' +
    '  If the file DISPLAYS permission state rather than gating on it, add it to\n' +
    '  DISPLAYS_RATHER_THAN_GATES in this script with what it renders.\n',
  );
  process.exit(1);
}

console.log(`  Permission gates: ${files.length} file(s) checked, ${DISPLAYS_RATHER_THAN_GATES.size} display-only  ok`);
