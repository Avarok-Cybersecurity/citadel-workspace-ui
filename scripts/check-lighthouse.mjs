#!/usr/bin/env node
/**
 * Lighthouse gate for the production build.
 *
 * Serves `dist/` and audits the landing page, then holds each category to a
 * baseline. Run after `npm run build`.
 *
 * On the baselines, and why they are not all the same:
 *
 *   accessibility   1.00  deterministic. It is a rule check, not a measurement,
 *                         and it passes at 100 today — anything less is a real
 *                         regression somebody introduced.
 *   seo             1.00  same reasoning.
 *   best-practices  0.95  near-deterministic; measured 0.96.
 *   performance     0.70  a MEASUREMENT, and the only one that varies with the
 *                         machine. Measured 0.83 locally; a shared CI runner is
 *                         slower and noisier. A tight performance gate produces
 *                         a flaky red build, and a flaky gate is worse than no
 *                         gate — people learn to re-run it without reading it.
 *                         The floor is set to catch a real collapse (a bundle
 *                         blowing up, a render-blocking script) rather than
 *                         drift, and the actual score is always printed so a
 *                         downward trend is visible before it trips.
 *
 * Bundle size is gated separately and precisely by check-bundle-budget.mjs,
 * which IS deterministic — that is the tool for catching perf drift.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const DIST = resolve(APP_ROOT, 'dist');
const PORT = Number(process.env.LIGHTHOUSE_PORT ?? 4173);
const URL = `http://localhost:${PORT}/`;

const BASELINES = {
  accessibility: 1.0,
  seo: 1.0,
  'best-practices': 0.95,
  performance: 0.7,
};

/** Metrics worth printing even when everything passes, so trends stay visible. */
const TRACKED_METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not answer on ${url} within ${timeoutMs}ms`);
}

async function main() {
  if (!existsSync(DIST)) {
    fail('dist/ not found — run `npm run build` first.');
  }

  // Imported lazily so the "did you build?" check above reports first, and so a
  // missing devDependency produces a clear message rather than a stack trace.
  let lighthouse;
  let chromeLauncher;
  try {
    ({ default: lighthouse } = await import('lighthouse'));
    chromeLauncher = await import('chrome-launcher');
  } catch (error) {
    fail(
      'lighthouse and chrome-launcher are required.\n' +
        '  Install with: npm i -D lighthouse chrome-launcher\n' +
        `  (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const preview = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: APP_ROOT, stdio: 'ignore' },
  );

  let chrome;
  try {
    await waitForServer(URL);

    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const result = await lighthouse(
      URL,
      { port: chrome.port, output: 'json', logLevel: 'error' },
      undefined,
    );

    if (!result?.lhr) fail('Lighthouse returned no result.');
    const { categories, audits } = result.lhr;

    console.log(`\n  Lighthouse — ${URL} (mobile, throttled)\n`);

    let failed = false;
    for (const [key, baseline] of Object.entries(BASELINES)) {
      const category = categories[key];
      if (!category) {
        console.log(`  ${key.padEnd(16)} MISSING from report`);
        failed = true;
        continue;
      }
      // A null score means the category could not be computed — treat as a
      // failure rather than passing something unmeasured.
      const score = category.score;
      const ok = typeof score === 'number' && score >= baseline;
      if (!ok) failed = true;
      const shown = typeof score === 'number' ? Math.round(score * 100) : 'n/a';
      console.log(
        `  ${key.padEnd(16)} ${String(shown).padStart(3)}  (min ${Math.round(baseline * 100)})  ${ok ? 'ok' : 'FAIL'}`,
      );
    }

    console.log('');
    for (const id of TRACKED_METRICS) {
      const audit = audits[id];
      if (audit?.displayValue) {
        console.log(`  ${id.padEnd(26)} ${audit.displayValue}`);
      }
    }
    console.log('');

    if (failed) {
      fail('Lighthouse baseline not met.');
    }
    console.log('  All Lighthouse baselines met.\n');
  } finally {
    // chrome-launcher 1.x returns void from kill(), not a promise — awaiting a
    // .catch() on it threw and turned a passing run into exit 1.
    try {
      chrome?.kill();
    } catch {
      // Cleanup only. A browser we could not kill must not fail the gate.
    }
    preview.kill();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
