/**
 * Citadel Docs text is as sharp as the screen allows, measured in a real browser on pixels.
 *
 * Serves the shipped DocumentHost (lib/docs-harness), types a line into a blank document at
 * devicePixelRatio 1 and 2, screenshots the first line in device pixels and measures every ink
 * edge (lib/docs-harness/edges.mjs). The browser composites a canvas at its CSS size, so a page
 * canvas of fractional CSS size (793.5 px for an odd 2x width) is rescaled by a pixel across the
 * page and every edge softens: the blur this guards. Every page canvas must also sit on whole
 * device pixels, with the host shifted by a fractional CSS offset as the app's layout can shift
 * it. The browser's own fillText of the same text in the same face is the reference.
 *
 *   CRISPNESS_OUT=<dir>   also writes each crop as <dir>/dpr<N>-offset<X>.png
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveDocsHarness } from './lib/docs-harness/serve.mjs';
import { grayscale, measureEdges } from './lib/docs-harness/edges.mjs';

const PORT = Number(process.env.DOCS_HARNESS_PORT ?? 4198);
const TEXT = 'Illumination lit HIH minimum';
/** Mean pixels per edge strictly between 10% and 90% of the step, at most (the owner's bar). */
const LIMIT = { 1: 1.5, 2: 2 };
/**
 * And no softer than the browser's own text by more than this, edge for edge. The owner's bar
 * alone passed the blur it was set for (a 2x page at 793.5 CSS px measured 1.42 across and 1.97
 * down against fillText's 0.81 and 1.25); a resampled canvas adds about half a pixel per edge.
 */
const OVER_REFERENCE = 0.25;
const OFFSETS = [0, 0.3];
const OUT = process.env.CRISPNESS_OUT ?? null;

async function pixels(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, rgba: Array.from(ctx.getImageData(0, 0, img.width, img.height).data) };
  }, png.toString('base64'));
}

async function measure(page, png) {
  const { width, height, rgba } = await pixels(page, png);
  return measureEdges(grayscale(rgba, width, height), width, height);
}

/**
 * The browser's own fillText of the same line in the same face (the Carlito the engine lays out
 * with, served beside the wasm) at the same size, 11 pt, as a reference.
 */
async function reference(page, dpr) {
  await page.evaluate(async ({ text, dpr }) => {
    const face = new FontFace('CarlitoReference', 'url(/fonts/cdoc/Carlito-Regular.ttf)');
    document.fonts.add(await face.load());
    const c = document.createElement('canvas');
    c.id = 'fillText-reference';
    c.width = 150 * dpr;
    c.height = 40 * dpr;
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', width: '150px', height: '40px', zIndex: '1000' });
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.font = `${(11 * 96 / 72) * dpr}px CarlitoReference`;
    ctx.fillText(text, 6 * dpr, 28 * dpr);
    document.body.append(c);
  }, { text: TEXT, dpr });
  // Through the same compositor and screenshot as the page, so only the rasteriser differs.
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 150, height: 40 } });
  await page.evaluate(() => document.getElementById('fillText-reference')?.remove());
  return { png, edges: await measure(page, png) };
}

/** Every page-view canvas whose screen rect does not start and end on whole device pixels. */
async function misplacedCanvases(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-testid="document-page"] canvas')].flatMap((el) => {
    const r = el.getBoundingClientRect();
    const d = window.devicePixelRatio;
    const edges = [r.left * d, r.top * d, r.right * d, r.bottom * d];
    const off = edges.some((v) => Math.abs(v - Math.round(v)) > 0.01);
    return off ? [`${el.dataset.layer ?? el.getAttribute('aria-label') ?? 'canvas'} at device (${edges.map((v) => v.toFixed(2)).join(', ')})`] : [];
  }));
}

async function crop(page) {
  const box = await page.locator('[data-testid="document-page"][data-page="0"]').boundingBox();
  if (box === null) throw new Error('the first page is not laid out');
  // One inch in (the blank document's margins at 100% zoom): the first line's ascenders to
  // descenders, short of where the line ends, so the caret after it is not measured.
  return { x: box.x + 90, y: box.y + 90, width: 150, height: 40 };
}

async function typedLine(page, dpr) {
  await page.locator('canvas[data-layer="page"]').first().waitFor({ timeout: 60_000 });
  await page.keyboard.type(TEXT);
  const clip = await crop(page);
  // Settled: two screenshots a quarter second apart are the same pixels, and hold text.
  let previous = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const png = await page.screenshot({ clip });
    if (previous !== null && png.equals(previous)) {
      try {
        return { png, edges: await measure(page, png) };
      } catch {
        // Not painted yet: keep waiting.
      }
    }
    previous = png;
    await page.waitForTimeout(250);
  }
  throw new Error(`dpr ${dpr}: the typed line never settled into painted text`);
}

const harness = await serveDocsHarness(PORT);
const browser = await chromium.launch();
let failures = 0;
try {
  if (OUT !== null) mkdirSync(OUT, { recursive: true });
  for (const dpr of [1, 2]) {
    for (const offset of OFFSETS) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr });
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(e.message));
      await page.goto(`${harness.origin}/?offset=${offset}`);
      const { png, edges } = await typedLine(page, dpr);
      const ref = await reference(page, dpr);
      if (OUT !== null) {
        writeFileSync(join(OUT, `dpr${dpr}-offset${offset}.png`), png);
        writeFileSync(join(OUT, `dpr${dpr}-fillText-reference.png`), ref.png);
      }
      problems.push(...(await misplacedCanvases(page)).map((c) => `not on device pixels: ${c}`));
      const worst = Math.max(edges.across.mean, edges.down.mean);
      const softer = Math.max(edges.across.mean - ref.edges.across.mean, edges.down.mean - ref.edges.down.mean);
      const ok = worst <= LIMIT[dpr] && softer <= OVER_REFERENCE && problems.length === 0;
      if (!ok) failures++;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  dpr ${dpr} offset ${offset}px: edge width across ${edges.across.mean} (p90 ${edges.across.p90}, ${edges.across.edges} edges), down ${edges.down.mean} (p90 ${edges.down.p90}); limit ${LIMIT[dpr]} and reference + ${OVER_REFERENCE}; fillText reference across ${ref.edges.across.mean}, down ${ref.edges.down.mean}${problems.length > 0 ? `; problems: ${problems.join(' | ')}` : ''}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await harness.close();
}
process.exit(failures === 0 ? 0 : 1);
