/**
 * An installed app running in its page zone, measured in a real browser on the shipped runtime
 * (lib/app-zone-harness: AppZone, zone-runtime.ts, the app worker, OffscreenCanvas and the SDK's
 * hello-canvas fixture). jsdom has no layout and no OffscreenCanvas, so none of this is visible to
 * a unit test:
 *
 * Running, at desktop width at 1x and at phone width at 2x: the canvas is exactly the zone (the
 * column's width, the author's 240 px), its bitmap is that times the device pixel ratio, nothing
 * overflows sideways, and the app's card -- drawn in CSS pixels, inset 10 px -- covers the canvas
 * at every ratio (read off the screenshot: blue inside the inset, white in the margin). The canvas
 * is reachable by keyboard and named; axe finds nothing serious.
 *
 * Refused (a signature that does not verify; this build's own verifier, which has no ML-DSA check
 * yet): the status fills the zone with the host's words, and nothing was painted.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveHarness } from './lib/docs-harness/serve.mjs';

const PORT = Number(process.env.APP_ZONE_HARNESS_PORT ?? 4201);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'lib', 'app-zone-harness');
const VIEWPORTS = [
  { name: 'desktop 1x', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  { name: 'phone 2x', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
];
const BLUE = [0x25, 0x63, 0xeb];
const WHITE = [0xff, 0xff, 0xff];

let failures = 0;
function check(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}
const near = (a, b) => Math.abs(a - b) <= 0.5;
const close = (px, want) => px.every((v, i) => Math.abs(v - want[i]) <= 24);

async function box(locator) {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('an element measured here is not laid out');
  return b;
}

/** The colour at CSS (x, y) of the page, from a screenshot (so it is what was composited, worker canvas included). */
async function pixel(page, x, y, dpr) {
  const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, scale: 'device' });
  return page.evaluate(async ({ b64, dpr: r }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(Math.floor(r / 2), Math.floor(r / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, { b64: shot.toString('base64'), dpr });
}

async function running(browser, origin, v) {
  const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor });
  const page = await context.newPage();
  await page.goto(`${origin}/?mode=ok`);
  const host = page.getByTestId('app-zone-host');
  await page.locator('[data-testid="app-zone-host"][data-app-state="running"]').waitFor({ timeout: 30_000 });
  // The app paints on its first frame; give the compositor a few.
  await page.waitForTimeout(500);
  const h = await box(host);
  const canvas = page.getByTestId('app-zone-canvas');
  const c = await box(canvas);
  const label = v.name;
  check(near(c.width, h.width) && near(c.x, h.x), `${label}: the canvas spans the zone (${c.width.toFixed(1)} of ${h.width.toFixed(1)} px)`);
  check(near(c.height, 240) && near(h.height, 240), `${label}: the canvas and the zone are the author's 240 px tall (${c.height.toFixed(1)}, ${h.height.toFixed(1)})`);
  const attr = await canvas.evaluate((el) => [el.width, el.height]);
  check(attr[0] === Math.round(h.width * v.deviceScaleFactor) && attr[1] === 240 * v.deviceScaleFactor, `${label}: the bitmap is the zone at ${v.deviceScaleFactor}x (${attr.join('x')})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${label}: nothing overflows sideways (${overflow}px)`);
  const status = await page.getByTestId('app-zone-status').evaluate((el) => getComputedStyle(el).display);
  check(status === 'none', `${label}: no status over a running app (${status})`);
  const points = [
    ['the centre', c.x + c.width / 2, c.y + c.height / 2, BLUE],
    ['three quarters across and down', c.x + c.width * 0.75, c.y + c.height * 0.75, BLUE],
    ['near the far corner, inside the inset', c.x + c.width - 14, c.y + c.height - 14, BLUE],
    ['the margin, outside the inset', c.x + c.width - 4, c.y + c.height - 4, WHITE],
  ];
  for (const [where, x, y, want] of points) {
    const got = await pixel(page, x, y, v.deviceScaleFactor);
    check(close(got, want), `${label}: the app's card at ${where} is ${want === BLUE ? 'blue' : 'white'} (rgb ${got.join(', ')})`);
  }
  await canvas.focus();
  check(await canvas.evaluate((el) => document.activeElement === el && el.getAttribute('aria-label') === 'Kanban'), `${label}: the canvas takes keyboard focus and is named for its app`);
  const axe = await new AxeBuilder({ page }).include('[data-testid="app-zone-host"]').analyze();
  const serious = axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  check(serious.length === 0, `${label}: axe finds nothing serious in the zone${serious.length ? ` (${serious.map((x) => x.id).join(', ')})` : ''}`);
  await context.close();
}

async function refused(browser, origin, v, mode, words) {
  const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor });
  const page = await context.newPage();
  await page.goto(`${origin}/?mode=${mode}`);
  await page.locator('[data-testid="app-zone-host"][data-app-state="stopped"]').waitFor({ timeout: 30_000 });
  const label = `${v.name}, ${mode}`;
  const h = await box(page.getByTestId('app-zone-host'));
  const s = await box(page.getByTestId('app-zone-status'));
  check(near(s.x, h.x) && near(s.width, h.width) && near(s.height, h.height), `${label}: the status fills the zone (${s.width.toFixed(0)}x${s.height.toFixed(0)} of ${h.width.toFixed(0)}x${h.height.toFixed(0)})`);
  const text = await page.getByTestId('app-zone-status').textContent();
  check(text === words, `${label}: it says "${text}"`);
  const fits = await page.getByTestId('app-zone-status').evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight);
  check(fits, `${label}: its words fit inside it`);
  await context.close();
}

const harness = await serveHarness(ROOT, PORT);
const browser = await chromium.launch();
try {
  for (const v of VIEWPORTS) {
    await running(browser, harness.origin, v);
    await refused(browser, harness.origin, v, 'bad-signature', 'Kanban did not pass its signature and hash check, so it was not started.');
    await refused(browser, harness.origin, v, 'unchecked', 'Kanban could not be checked on this device, so it was not started.');
  }
} finally {
  await browser.close();
  await harness.close();
}
if (failures > 0) {
  console.error(`\n${failures} app zone check(s) failed.`);
  process.exit(1);
}
console.log('\nAll app zone checks passed.');
