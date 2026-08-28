/**
 * Checks the first-run screens at phone width for the two failures that make an
 * installed app feel broken on a phone, neither of which axe reports.
 *
 * 1. Horizontal overflow. One element wider than the viewport makes the whole
 *    page scroll sideways, and every subsequent tap lands slightly off.
 * 2. Tap targets under 24x24 CSS px — the WCAG 2.2 floor. axe measures colour,
 *    names and roles, not size, so a 16px control passes every accessibility
 *    gate already in place while being genuinely hard to hit with a thumb.
 *    Three shipped that way: the landing Settings link, the password reveal,
 *    and the close button on EVERY dialog in the app.
 *
 * Pre-auth screens only, so it needs no backend and runs beside the other
 * production-bundle checks. That is also where it matters most: these are the
 * screens someone meets before they have any reason to persevere.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { chromium } from 'playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.MOBILE_CHECK_PORT ?? 4178);
const ORIGIN = `http://localhost:${PORT}`;
const MIN_TARGET = 24;

/** Narrowest first, so the first failure reported is the hardest case. */
const WIDTHS = [320, 360, 375];

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${ORIGIN}/`)).ok) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Runs in the page: overflow width, and every interactive element under the floor. */
function measurePage(min) {
  const root = document.documentElement;
  const interactive = 'button,a,[role="button"],[role="switch"],input[type="checkbox"],input[type="radio"]';
  const small = [...document.querySelectorAll(interactive)]
    .filter((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      return box.width < min || box.height < min;
    })
    .map((el) => {
      const box = el.getBoundingClientRect();
      const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24);
      return `${el.tagName}"${label}" ${Math.round(box.width)}x${Math.round(box.height)}`;
    });
  return { overflow: root.scrollWidth - root.clientWidth, small };
}

async function main() {
  if (!existsSync(join(APP_ROOT, 'dist', 'index.html'))) {
    console.error('\n  dist/ is missing — run `npm run build` first.\n');
    process.exit(1);
  }

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: APP_ROOT, stdio: 'ignore',
  });
  if (!(await waitForServer())) {
    preview.kill();
    console.error('\n  vite preview did not start.\n');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // 375 was the only width measured, described as "the smallest widely-used
    // phone". It is not: 360 is the most common Android width and 320 is the
    // floor a responsive layout is normally held to. Both were measured before
    // being added here and both already pass, so this is a lock rather than a
    // repair -- but a layout that fits at 375 and breaks at 360 breaks for more
    // people than one that breaks at 375.
    for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // Testids, not button copy.
    //
    // These read `getByRole('button', { name: /Join Workspace/i })` and
    // `/Login Workspace/i`, which is what those buttons said before they were
    // renamed to "Sign In" and "Create Account" -- because neither old label was
    // English and "Join" meant *create an account*. The integration suite was
    // migrated to testids when that happened and this script was not, so it has
    // been failing on a thirty-second locator timeout ever since, invisibly:
    // it needs a browser and a served build, so it never runs in preflight, and
    // the job it lives in was already failing earlier for other reasons.
    //
    // Fixing those earlier gates is what surfaced this one. A dead check behind
    // a failing check is indistinguishable from a passing one.
    const screens = [
      ['landing', async () => { await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' }); }],
      ['create-account', async () => {
        await page.getByTestId('create-account-button').click({ force: true });
      }],
      ['sign-in', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('sign-in-button').click({ force: true });
      }],
      ['manage-accounts', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('manage-accounts-button').click({ force: true });
      }],
    ];

    for (const [name, go] of screens) {
      await go();
      // Settle transitions before measuring: a box mid-animation is not its size.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))))
        .catch(() => {});
      await page.waitForTimeout(400);

      const { overflow, small } = await page.evaluate(measurePage, MIN_TARGET);
      record(`${width}px ${name}: fits the viewport`, overflow <= 0, overflow > 0 ? `${overflow}px of sideways scroll` : '');
      record(`${width}px ${name}: tap targets are at least ${MIN_TARGET}px`, small.length === 0, small.join('; '));
    }

    await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n  Mobile layout — 375x667, ${ORIGIN} (production bundle)\n`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(width)}  ${r.ok ? 'ok' : 'FAIL'}  ${r.detail}`);
  }
  if (results.some((r) => !r.ok)) {
    console.error('\n  Mobile layout checks failed.\n');
    process.exit(1);
  }
  console.log('\n  All mobile layout checks passed.\n');
}

await main();
