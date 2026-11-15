import { strict as assert } from 'node:assert';

const settled = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle'), undefined, { timeout: 5000 });
const inside = (inner, outer) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

/**
 * A signed-out row is a 44px target inside the menu and the viewport; its "Signed out / Sign in"
 * tag is drawn (not hover-only), sits inside the row, and covers neither the name nor the avatar.
 */
async function aSignedOutRowSaysSo({ page, url, viewport }) {
  await page.goto(url('switcher-signed-out'));
  const item = page.getByTestId('switcher-account-signed-out');
  await item.waitFor({ state: 'visible' });
  await settled(page);
  const box = await item.boundingBox();
  assert.ok(box.height >= 44, `the signed-out row is ${box.height}px tall (needs 44)`);
  assert.ok(inside(box, { x: 0, y: 0, ...viewport }), `the row ${JSON.stringify(box)} leaves the ${viewport.width}px viewport`);
  assert.ok(inside(box, await page.getByRole('menu').boundingBox()), 'the row leaves its menu');
  const tag = item.getByText('Sign in', { exact: true });
  const tagBox = await tag.boundingBox();
  assert.ok(inside(tagBox, box), `the Sign in tag ${JSON.stringify(tagBox)} leaves its row ${JSON.stringify(box)}`);
  assert.ok(Number(await tag.evaluate((el) => getComputedStyle(el).opacity)) > 0.9, 'the Sign in tag is not drawn at rest');
  // Both text lines end before the tag's column starts: a long name or handle truncates, never runs into it.
  const column = await item.getByTestId('switcher-account-signed-out-tag').boundingBox();
  for (const [what, locator] of [['name', item.getByText(/Margaret Hamilton/)], ['handle', item.getByTestId('switcher-account-handle')]]) {
    const line = await locator.boundingBox();
    assert.ok(line.x + line.width <= column.x + 0.5, `the ${what} ${JSON.stringify(line)} runs into the tag ${JSON.stringify(column)}`);
  }
  assert.equal(await item.getAttribute('aria-label'), 'Sign in to margaret.hamilton.apollo on bench.work.avarok.net (signed out)');
}

/**
 * The sign-in a signed-out row opens fits the screen, says why inside its card, starts in the
 * empty password field with the username filled, has a 44px submit, and closes on Escape.
 */
async function theSignInSaysWhy({ page, url, viewport }) {
  await page.goto(url('sign-in-signed-out'));
  const notice = page.getByTestId('login-notice');
  await notice.waitFor({ state: 'visible' });
  await settled(page);
  const dialog = await page.getByRole('dialog', { name: 'Sign in' }).boundingBox();
  const card = await page.locator('form').boundingBox();
  assert.ok(inside(dialog, { x: 0, y: 0, ...viewport }), `the sign-in ${JSON.stringify(dialog)} leaves the ${viewport.width}px viewport`);
  assert.ok((await notice.boundingBox()).x + (await notice.boundingBox()).width <= viewport.width, 'the reason runs off the screen');
  assert.match(await notice.textContent(), /margaret\.hamilton\.apollo on bench\.work\.avarok\.net is signed out/);
  assert.equal(await page.locator('#username').inputValue(), 'margaret.hamilton.apollo');
  assert.equal(await page.locator('#password').inputValue(), '');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'password', 'the cursor is not in the password field');
  const submit = await page.getByTestId('login-submit').boundingBox();
  assert.ok(submit.height >= 44 && inside(submit, card), `the submit ${JSON.stringify(submit)} is not a 44px target inside the form`);
  await page.keyboard.press('Escape');
  await page.getByTestId('sign-in-closed').waitFor({ timeout: 3000 });
}

export const ACCOUNT_SWITCH_CHECKS = { aSignedOutRowSaysSo, theSignInSaysWhy };
