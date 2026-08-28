/**
 * axe against the screens a visitor meets before they have an account.
 *
 * There is already an accessibility spec — `integration-tests/src/tests-pw/
 * accessibility.spec.ts` — and it is better than this one: it signs in and
 * covers the workspace. It also needs a backend, an account and a completed
 * registration, so when registration breaks it stops running, and it stops
 * running silently.
 *
 * That is the shape round 188 recorded: `check-mobile-layout.mjs` spent weeks
 * timing out behind an earlier failure in the same job, and a dead check behind
 * a failing check is indistinguishable from a passing one. The pre-auth screens
 * need nothing but a served bundle, so their accessibility should not depend on
 * whether an account can be created.
 *
 * Includes `wcag22aa`, which the spec does not: WCAG 2.2 is where target size
 * lives, and three controls were found at 21px against its 24px floor.
 *
 * Gated on `serious` and `critical`, matching the spec — `minor` and `moderate`
 * are dominated by advice that would make this a running argument with the
 * designer rather than a defect gate.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.A11Y_PORT ?? 4186);
const ORIGIN = `http://localhost:${PORT}`;

/** WCAG 2.0, 2.1 and 2.2, A and AA. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`${ORIGIN}/`)).ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  if (!existsSync(join(APP_ROOT, 'dist', 'index.html'))) {
    console.error('\n  dist/ is missing — run `npm run build` first.\n');
    process.exit(1);
  }

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: APP_ROOT,
    stdio: 'ignore',
  });
  if (!(await waitForServer())) {
    preview.kill();
    console.error('\n  vite preview did not start.\n');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // A phone viewport, because that is where a layout runs out of room and
    // starts producing the overlaps and clipped labels axe can see.
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();

    const screens = [
      ['landing', async () => { await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' }); }],
      ['sign-in', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('sign-in-button').click({ force: true });
      }],
      ['create-account', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('create-account-button').click({ force: true });
      }],
      ['manage-accounts', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('manage-accounts-button').click({ force: true });
      }],
    ];

    let scanned = 0;
    for (const [name, go] of screens) {
      await go();
      // Animations move elements while axe measures them, and a colour read
      // mid-transition is fiction. Settle before scanning.
      await page.waitForTimeout(1_200);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      scanned += 1;
      const blocking = violations.filter((v) => BLOCKING.has(v.impact));
      record(
        `${name}: no serious or critical violations`,
        blocking.length === 0,
        blocking.map((v) => `${v.id} x${v.nodes.length}`).join('; '),
      );
    }

    // A scan that reached no screen is a clean run over nothing.
    record('every screen was reached', scanned === screens.length, `${scanned}/${screens.length}`);

    await context.close();
  } finally {
    await browser.close();
    preview.kill();
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n  Accessibility — ${ORIGIN} (production bundle, 375px)\n`);
  for (const { name, ok, detail } of results) {
    console.log(`  ${name.padEnd(width)}  ${ok ? 'ok  ' : 'FAIL'}${detail ? `  ${detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n  ${failed.length} accessibility check(s) failed.\n`);
    process.exit(1);
  }
  console.log('\n  All accessibility checks passed.\n');
}

await main();
