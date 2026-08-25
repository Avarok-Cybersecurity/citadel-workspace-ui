/**
 * Verifies the promise the app makes when it says "A new version of Citadel is
 * ready" — that an ALREADY-INSTALLED app notices a deployment and offers the
 * user the reload, rather than serving yesterday's bundle forever.
 *
 * This is the upgrade half of the PWA lifecycle, and the half that fails
 * silently. An installed service worker keeps serving its cached bundle by
 * design; if the update path is broken, nothing errors, no user complains, and
 * the app simply stops changing. The unit test beside PwaUpdatePrompt mocks
 * `virtual:pwa-register/react`, so it proves the component reacts to
 * `needRefresh` — it cannot prove anything ever SETS it.
 *
 * A deployment is simulated the way a real one presents itself to a browser:
 * the bytes of sw.js change. That is the only signal the update algorithm uses,
 * so reproducing it is faithful rather than approximate. dist/ is copied first
 * and the copy is mutated, so the artefact the other checks share is untouched.
 *
 * Served from a plain static server rather than `vite preview`, because this
 * needs to rewrite a file mid-session and preview owns its own directory.
 */
import { createServer } from 'node:http';
import { cp, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const DIST = resolve(APP_ROOT, 'dist');
const PORT = Number(process.env.PWA_UPDATE_PORT ?? 4176);
const ORIGIN = `http://localhost:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

function serve(root) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, ORIGIN);
    // normalize + prefix check: a static server that joins user input straight
    // onto a root will serve /../../etc/passwd.
    const target = normalize(join(root, decodeURIComponent(url.pathname)));
    let file = target.startsWith(root) ? target : root;
    if (!existsSync(file) || extname(file) === '') file = join(root, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        // The update algorithm must see the network copy of sw.js, not a cached one.
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

async function main() {
  if (!existsSync(join(DIST, 'sw.js'))) {
    console.error('\n  dist/sw.js is missing — run `npm run build` first.\n');
    process.exit(1);
  }

  const root = await mkdtemp(join(tmpdir(), 'pwa-update-'));
  await cp(DIST, root, { recursive: true });
  const server = await serve(root);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });

    // `ready` resolves on an ACTIVE worker, but with registerType 'prompt' the
    // first worker does not claim the page that installed it (workbox leaves
    // clientsClaim off), so a reload is what puts the page under its control —
    // which is also the honest sequence: a returning visit, not the install.
    //
    // Raced against a timeout because `ready` never settles when no worker
    // registers at all; awaiting it bare turns a failure into a hang.
    const active = await page.evaluate(
      () =>
        Promise.race([
          navigator.serviceWorker.ready.then(() => true),
          new Promise((ok) => setTimeout(() => ok(false), 30_000)),
        ]),
    );
    record('the app installs a service worker', active);
    if (!active) throw new Error('no service worker registered');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const controlled = await page
      .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    record('a returning visit is served by that worker', controlled);
    if (!controlled) throw new Error('no controlling service worker after reload');

    // What a deployment looks like to a browser: different sw.js bytes.
    const swPath = join(root, 'sw.js');
    await writeFile(swPath, (await readFile(swPath, 'utf8')) + '\n// deployed\n');

    const found = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      await reg.update();
      // installed + an existing controller IS the waiting-update state.
      return new Promise((ok) => {
        const done = () => ok(Boolean(reg.waiting || reg.installing));
        if (reg.waiting) return ok(true);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return done();
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed') ok(true);
          });
        });
        setTimeout(done, 20_000);
      });
    });
    record('a new deployment is detected', found);

    // The user-visible half. A detected update nobody is told about is the same
    // as no update at all.
    const prompt = page.getByText(/A new version of Citadel is ready/i);
    const shown = await prompt
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    record('the user is offered the update', shown);

    const reload = page.getByRole('button', { name: /^reload$/i });
    const actionable = shown && (await reload.count()) > 0;
    record('the offer carries a Reload action', actionable);
  } finally {
    await browser.close();
    server.close();
    await rm(root, { recursive: true, force: true });
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n  PWA update — ${ORIGIN} (production bundle)\n`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(width)}  ${r.ok ? 'ok' : 'FAIL'}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n  ${failed.length} PWA update check(s) failed.\n`);
    process.exit(1);
  }
  console.log('\n  All PWA update checks passed.\n');
}

await main();
