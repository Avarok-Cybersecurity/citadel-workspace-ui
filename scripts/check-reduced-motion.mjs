/**
 * Verifies the app honours prefers-reduced-motion, and that honouring it did
 * not break the thing that depends on animations existing.
 *
 * Neither axe nor Lighthouse reports motion, so this had gone unnoticed: ninety
 * of the app's hundred animations opted out of nothing. Motion of that kind is
 * not a preference for people with vestibular disorders.
 *
 * The third check guards the class of regression where suppressing motion also
 * suppresses the thing the motion was attached to, leaving a dialog on screen
 * with no way out. Radix survives `animation: none` on its own — its Presence
 * checks for animationName "none" and unmounts immediately, which was measured
 * rather than assumed — but overlays elsewhere are hand-rolled, and a failure
 * here would only appear for users who asked for reduced motion, the last group
 * likely to be testing a release.
 *
 * Runs against the production bundle, like the other checks here, and needs no
 * backend: everything asserted is on the landing page.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { chromium } from 'playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.REDUCED_MOTION_PORT ?? 4177);
const ORIGIN = `http://localhost:${PORT}`;

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

/** Computed animation of a throwaway element carrying `className`. */
const probe = (className) => (cls) => {
  const el = document.createElement('div');
  el.className = cls;
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = { duration: cs.animationDuration, iterations: cs.animationIterationCount };
  el.remove();
  return out;
};

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
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });

    const seen = await page.evaluate(
      ([fn]) => {
        const p = new Function(`return (${fn})`)()();
        return { pulse: p('animate-pulse'), spin: p('animate-spin') };
      },
      [probe.toString()],
    );

    // Decorative motion stops.
    record(
      'pulsing and glowing motion is suppressed',
      parseFloat(seen.pulse.duration) < 0.01 && seen.pulse.iterations === '1',
      `${seen.pulse.duration} x${seen.pulse.iterations}`,
    );

    // Spinners keep turning: a frozen one reads as a hung app, which is worse
    // than the motion it would avoid.
    record(
      'spinners still turn, so waiting still looks like waiting',
      seen.spin.iterations === 'infinite' && parseFloat(seen.spin.duration) > 0.5,
      `${seen.spin.duration} x${seen.spin.iterations}`,
    );

    // The one that catches `animation: none`.
    await page.getByRole('button', { name: /Manage Accounts/i }).click({ force: true });
    const dialog = page.locator('[role="dialog"]').first();
    const opened = await dialog.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    await page.keyboard.press('Escape');
    const closed = await dialog.waitFor({ state: 'detached', timeout: 15_000 }).then(() => true).catch(() => false);
    record('dialogs still close, not merely fade', opened && closed);

    await context.close();
  } finally {
    await browser.close();
    preview.kill();
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n  Reduced motion — ${ORIGIN} (production bundle)\n`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(width)}  ${r.ok ? 'ok' : 'FAIL'}  ${r.detail}`);
  }
  if (results.some((r) => !r.ok)) {
    console.error('\n  Reduced-motion checks failed.\n');
    process.exit(1);
  }
  console.log('\n  All reduced-motion checks passed.\n');
}

await main();
