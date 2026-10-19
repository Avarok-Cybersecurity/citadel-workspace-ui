import { strict as assert } from 'node:assert';

/** A dialog is measured at rest: mid-animation its box is the scaled frame, not where it lands. */
const settled = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle'), undefined, { timeout: 5000 });

const inside = (inner, outer) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

/**
 * The share dialog at 375px (the narrowest phone this app is laid out for) and on a desktop: it
 * stays on screen with no sideways scroll, every grant chip and control sits inside it, and once
 * made, the link's field and its Copy button are both visible, side by side, neither hidden.
 */
const theShareDialogFits = (scenario, measured) => async ({ page, url, viewport }) => {
  const width = viewport.width < 600 ? 375 : viewport.width;
  await page.setViewportSize({ width, height: viewport.height });
  try {
    await page.goto(url(scenario));
    const dialog = page.getByTestId('share-link-dialog');
    await dialog.waitFor({ state: 'visible' });
    await settled(page);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `the dialog ${JSON.stringify(box)} leaves the ${width}px viewport`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `the page scrolls sideways by ${overflow}px`);
    const parts = await dialog.locator('[data-testid="share-grant-chip"], button, input, [role="combobox"], [role="meter"]').evaluateAll(
      (nodes) => nodes.filter((n) => n.getClientRects().length > 0).map((n) => ({ id: n.dataset.testid ?? n.textContent ?? n.tagName, ...n.getBoundingClientRect().toJSON() })),
    );
    assert.ok(parts.length >= 4, `the scenario draws its controls, found ${parts.length}`);
    // The dialog scrolls vertically on a short screen, so only the sideways bound is the dialog's.
    for (const p of parts) assert.ok(p.x >= box.x - 0.5 && p.x + p.width <= box.x + box.width + 0.5, `${p.id} ${JSON.stringify(p)} overhangs the dialog ${JSON.stringify(box)}`);
    if (measured) {
      const field = await page.getByTestId('share-secure-link-field').boundingBox();
      const copy = await page.getByTestId('share-secure-link-copy').boundingBox();
      assert.ok(field && copy, 'the link field and Copy are drawn');
      assert.ok(inside(field, box) && inside(copy, box), `field ${JSON.stringify(field)} or Copy ${JSON.stringify(copy)} is outside the dialog`);
      assert.ok(field.width >= 120, `the link field is ${field.width}px wide, too narrow to read`);
      assert.ok(copy.width >= 24 && copy.height >= 24, `Copy is a ${copy.width}x${copy.height} target`);
      assert.ok(field.x + field.width <= copy.x + 0.5, `Copy ${JSON.stringify(copy)} lies on the field ${JSON.stringify(field)}`);
      assert.ok(await page.getByTestId('share-shown-once').isVisible(), 'the shown-once warning is drawn');
    }
  } finally {
    await page.setViewportSize(viewport);
  }
};

export const SHARE_CHECKS = {
  theShareDialogFitsWhileChoosing: theShareDialogFits('share-secure-editing', false),
  theMadeLinkAndItsCopyAreVisible: theShareDialogFits('share-secure-created', true),
};
