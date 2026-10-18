import { strict as assert } from 'node:assert';
import { AxeBuilder } from '@axe-core/playwright';
import { settled } from './checks-controls.mjs';

const TABS = ['home', 'insert', 'layout'];
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** The ribbon's own floor (the brief's 44px), above WCAG 2.2's 24. */
const MIN_TARGET = 44;

async function openRibbon(page, url, scenario) {
  await page.goto(url(scenario));
  await page.getByTestId('docs-ribbon').waitFor({ state: 'visible' });
  await settled(page);
}

async function showTab(page, tab) {
  await page.getByTestId(`docs-ribbon-tab-${tab}`).click();
  await page.getByTestId(`ribbon-${tab}-toolbar`).waitFor({ state: 'visible' });
  await settled(page);
}

async function axeViolations(page, include) {
  const { violations } = await new AxeBuilder({ page }).include(include).withTags(WCAG).analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`));
}

/** axe (WCAG 2.2 AA, contrast included) over each tab, settled, and over each collapsed group's popover. */
const eachTabPassesAxe = (scenario) => async ({ page, url }) => {
  await openRibbon(page, url, scenario);
  for (const tab of TABS) {
    await showTab(page, tab);
    const found = await axeViolations(page, '[data-testid="docs-ribbon"]');
    assert.equal(found.length, 0, `${tab}: ${found.slice(0, 5).join(' | ')}`);
    const groups = page.locator(`[data-testid="ribbon-${tab}-toolbar"] [data-testid$="-open"]`);
    for (let i = 0; i < await groups.count(); i += 1) {
      const opener = await groups.nth(i).getAttribute('data-testid');
      await groups.nth(i).click();
      // A popover's content is a dialog; tooltips share its wrapper, so the wrapper alone is not it.
      const popover = page.locator('[data-radix-popper-content-wrapper] [role="dialog"]');
      await popover.waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail(`${opener} opened no popover`));
      await settled(page);
      const inside = await axeViolations(page, '[data-radix-popper-content-wrapper]:has([role="dialog"])');
      assert.equal(inside.length, 0, `${tab} ${opener}: ${inside.slice(0, 5).join(' | ')}`);
      // The focused control's tooltip is the top layer, so the first Escape closes it, the second the popover.
      for (let presses = 0; presses < 2 && await popover.count() > 0; presses += 1) {
        await page.keyboard.press('Escape');
        await settled(page);
      }
      await popover.waitFor({ state: 'detached', timeout: 3000 }).catch(() => assert.fail(`Escape left ${opener}'s popover open`));
    }
  }
};

/** Every control on every tab is a 44px target inside the viewport, and the page never scrolls sideways. */
async function ribbonTargetsAndWidth({ page, url, viewport }) {
  await openRibbon(page, url, 'docs-ribbon');
  for (const tab of TABS) {
    await showTab(page, tab);
    const small = await page.evaluate((min) => [...document.querySelectorAll('[data-testid="docs-ribbon"] [data-roving-item], [data-testid="docs-ribbon"] [role="tab"]')]
      .map((el) => ({ el: el.type === 'color' ? el.parentElement : el, id: el.dataset.testid ?? el.textContent }))
      .map(({ el, id }) => ({ id, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < min || r.height < min))
      .map(({ id, r }) => `${id} ${Math.round(r.width)}x${Math.round(r.height)}`), MIN_TARGET);
    assert.equal(small.length, 0, `${tab}: ${small.slice(0, 6).join(' | ')}`);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= viewport.width, `${tab}: the page is ${width}px wide in a ${viewport.width}px viewport`);
    // The page may clip what overflows (overflow-x hidden), so the controls' own boxes are measured too.
    const outside = await page.evaluate((w) => [...document.querySelectorAll('[data-testid="docs-ribbon"] [data-roving-item]')]
      .map((el) => ({ id: el.dataset.testid, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.left < 0 || r.right > w))
      .map(({ id, r }) => `${id} ${Math.round(r.left)}..${Math.round(r.right)}`), viewport.width);
    assert.equal(outside.length, 0, `${tab}: controls past the ${viewport.width}px viewport: ${outside.slice(0, 4).join(' | ')}`);
  }
}

async function assertPopoversOnScreen(page, viewport, what) {
  const boxes = await page.locator('[data-radix-popper-content-wrapper]:has([role="dialog"])').evaluateAll((all) => all.map((el) => el.getBoundingClientRect().toJSON()));
  assert.ok(boxes.length > 0, `${what} opened no popover`);
  for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.width <= viewport.width, `${what}: a popover ${JSON.stringify(b)} leaves the ${viewport.width}px viewport`);
}

/** The table grid and the page-size menu (the widest of Page Setup's) stay inside a phone's width. */
async function popoversStayOnScreen({ page, url, viewport }) {
  await openRibbon(page, url, 'docs-ribbon');
  await showTab(page, 'insert');
  await page.getByTestId('ribbon-insert-table').click();
  await page.getByTestId('ribbon-table-cell-7-7').waitFor({ state: 'visible' });
  await settled(page);
  await assertPopoversOnScreen(page, viewport, 'the table grid');
  await page.keyboard.press('Escape');
  await openRibbon(page, url, 'docs-ribbon');
  await showTab(page, 'layout');
  // At phone width Page Setup is collapsed into one button whose popover holds the menus.
  const group = page.getByTestId('ribbon-page-setup-open');
  if (await group.isVisible()) await group.click();
  await page.getByTestId('ribbon-page-size-open').click();
  await page.getByTestId('ribbon-page-size-a5').waitFor({ state: 'visible' });
  await settled(page);
  await assertPopoversOnScreen(page, viewport, 'the page-size menu');
}

export const RIBBON_CHECKS = {
  ribbonPassesAxe: eachTabPassesAxe('docs-ribbon'),
  ribbonPassesAxeWithAnUnknownCaret: eachTabPassesAxe('docs-ribbon-unknown'),
  ribbonTargetsAndWidth,
  popoversStayOnScreen,
};
