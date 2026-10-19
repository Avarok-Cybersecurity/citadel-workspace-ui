/**
 * Scrolling a long Citadel Docs document never drops frames, measured in a real browser.
 *
 * Opens the 500-page benchmark document (lib/docs-harness/fixtures/500p.docx, the citadel-docs
 * bench corpus) in the shipped editor on the docs harness, throttles the CPU 4x (the shared
 * 2-vCPU runner the in-browser benchmark runs on), then scrolls one viewport per frame to the
 * end, timing every frame. On that runner the page view measured 33.3 ms median with 51% of
 * frames over a frame (16.7 ms) against ONLYOFFICE's 16.7 ms and 5%: paints on scroll
 * competing with the main thread. At most MAX_LONG of frames may run long.
 *
 *   SCROLL_THROTTLE=<rate>   CPU throttling (default for the gate: 4; 1 to measure unthrottled)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDocsHarness } from './lib/docs-harness/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DOCS_HARNESS_PORT ?? 4199);
const DOC = join(HERE, 'lib/docs-harness/fixtures/500p.docx');
const THROTTLE = Number(process.env.SCROLL_THROTTLE ?? 4);
/** One frame at 60 Hz, and the share of frames allowed past it (ONLYOFFICE's on the runner). */
const FRAME_MS = 1000 / 60;
const MAX_LONG = 0.05;
/** rAF deltas jitter around a vsync; a frame is long only when it misses one. */
const JITTER_MS = 1;
/**
 * A pass needs one frame per viewport; one that takes twice that has failed. It is something
 * pulling the view back (a caret reveal answered every viewport report once), and unbounded it
 * never ends.
 */
const SLACK = 2;

const harness = await serveDocsHarness(PORT);
const browser = await chromium.launch();
let ok = false;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route((url) => url.pathname === '/fixtures/500p.docx', (route) => route.fulfill({ body: readFileSync(DOC), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  await page.goto(`${harness.origin}/?doc=/fixtures/500p.docx`);
  const status = page.locator('[data-testid="docs-page-status"]');
  await status.filter({ hasText: /Page \d+ of \d{3}/ }).waitFor({ timeout: 180_000 });
  console.log('  opened');
  const total = Number((await status.innerText()).match(/of (\d+)/)[1]);
  if (total < 400) throw new Error(`the benchmark document laid out as ${total} pages, not about 500`);
  await page.locator('canvas[data-layer="page"]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  console.log('  painted');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const frames = await page.evaluate((slack) => new Promise((resolve, reject) => {
    const view = document.querySelector('[data-testid="page-view"]');
    if (!(view instanceof HTMLElement)) throw new Error('no page view');
    const max = slack * Math.ceil(view.scrollHeight / view.clientHeight);
    const deltas = [];
    let last = null;
    const step = (now) => {
      if (last !== null) deltas.push(now - last);
      last = now;
      if (view.scrollTop + view.clientHeight >= view.scrollHeight - 1) return resolve(deltas);
      if (deltas.length > max) return reject(new Error(`no end after ${max} frames (at ${view.scrollTop} of ${view.scrollHeight}): something pulls the view back`));
      view.scrollBy(0, view.clientHeight);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), SLACK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const long = frames.filter((d) => d > FRAME_MS + JITTER_MS).length;
  const share = long / frames.length;
  ok = share <= MAX_LONG && errors.length === 0;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${total} pages, ${frames.length} frames at ${THROTTLE}x CPU throttling: median ${at(0.5).toFixed(1)} ms, p95 ${at(0.95).toFixed(1)} ms, max ${sorted[sorted.length - 1].toFixed(1)} ms; ${long} (${(100 * share).toFixed(1)}%) over ${FRAME_MS.toFixed(1)} ms, limit ${100 * MAX_LONG}%${errors.length > 0 ? `; page errors: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  await harness.close();
}
process.exit(ok ? 0 : 1);
