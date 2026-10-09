/**
 * Measured layout for the release-N+1 chat polish, in a real browser engine.
 *
 * jsdom has no layout, so "the card covers the row above" and "the message sits against the
 * bubble above it" cannot be asserted there; the classes can all be right and the pixels wrong.
 * This serves the real components (see lib/polish-harness) and asserts bounding boxes, in
 * Chromium and WebKit, at desktop and phone widths.
 */
import { chromium, webkit } from 'playwright';
import { serveHarness } from './lib/polish-harness/serve.mjs';
import { CHECKS } from './lib/polish-harness/checks.mjs';

const PORT = Number(process.env.POLISH_PORT ?? 4197);
const AVAILABLE = { chromium, webkit };
// CI installs Chromium only; a machine with WebKit sets POLISH_ENGINES=chromium,webkit (the default).
const ENGINES = Object.fromEntries(
  (process.env.POLISH_ENGINES ?? 'chromium,webkit').split(',').map((name) => {
    if (!AVAILABLE[name]) throw new Error(`POLISH_ENGINES names an engine this gate cannot drive: ${name}`);
    return [name, AVAILABLE[name]];
  }),
);
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
const THEMES = ['light', 'dark'];

const harness = await serveHarness(PORT);
let failures = 0;
try {
  for (const [engineName, engine] of Object.entries(ENGINES)) {
    const browser = await engine.launch();
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
        const page = await context.newPage();
        // The whole chat is mounted with no agent behind it, so its own leader probe rejects. That is the
        // absence this scenario is built on, not a defect; any other uncaught error still fails the run.
        page.on('pageerror', (e) => {
          if (e.message.includes('The leader could not say what the agent hosts')) return;
          console.error(`  pageerror: ${e.message}`); failures += 1;
        });
        for (const [name, check] of Object.entries(CHECKS)) {
          const label = `${name} [${engineName} ${viewport.width}px ${theme}]`;
          try {
            await check({ page, url: (scenario) => `${harness.origin}/?s=${scenario}&theme=${theme}`, viewport });
            console.log(`  ok    ${label}`);
          } catch (error) {
            failures += 1;
            console.error(`  FAIL  ${label}\n        ${error.message}`);
          }
        }
        await context.close();
      }
    }
    await browser.close();
  }
} finally {
  await harness.close();
}
process.exit(failures === 0 ? 0 : 1);
