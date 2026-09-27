/**
 * The hierarchy editor, driven by the gestures a person uses: a level dragged from the palette,
 * a "may contain" edge drawn from one level's handle to another, a rename, one Save, and the
 * result read back from the server by reopening the editor.
 *
 * The unit tests drive the same edits through the level list and panel (the keyboard and
 * small-screen path); what only a browser can show is that the React Flow drags really make
 * them, and that the server keeps them.
 *
 * Not covered here: the Organisation view's drag-to-move (covered by unit tests and by the
 * tree-move integration suite through the move request itself).
 *
 * Integration specs share one backend, so the hierarchy is put back as it was (afterAll): a
 * renamed "Office" would change the wording every later spec reads.
 */
import { test, expect, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { adminCredentials, clearBrowserStorage, closeAnyModals, hasWorkspaceAdmin, loginAfterDisconnect, waitForAppReady, waitForWorkspaceLoaded } from '../lib/index.js';
import { config } from '../lib/config.js';

const NEW_LEVEL: string = 'Level 3';

async function openEditor(page: Page): Promise<void> {
  const open: Locator = page.getByTestId('open-hierarchy-editor');
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await expect(page.getByTestId('structure-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('level-node-Office')).toBeVisible({ timeout: 15_000 });
}

async function closeEditor(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hierarchy-editor')).toBeHidden({ timeout: 10_000 });
}

/** Draws an edge: press on the source level's handle, release on the target level's top handle. */
async function connect(page: Page, from: string, to: string): Promise<void> {
  type Box = Awaited<ReturnType<Locator['boundingBox']>>;
  const source: Box = await page.getByTestId(`level-handle-${from}`).boundingBox();
  const target: Box = await page.getByTestId(`level-node-${to}`).boundingBox();
  if (!source || !target) throw new Error(`cannot draw ${from} → ${to}: a level is not on screen`);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 4, { steps: 12 });
  await page.mouse.up();
}

async function save(page: Page): Promise<void> {
  const button: Locator = page.getByTestId('save-hierarchy');
  await expect(button).toBeEnabled();
  await button.click();
  // Saved: nothing is staged any more, so the button goes back to disabled.
  await expect(button).toBeDisabled({ timeout: 20_000 });
  await expect(page.getByTestId('hierarchy-problem')).toHaveCount(0);
}

test.describe.serial('Hierarchy editor', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    page = await context.newPage();
    // Editing the hierarchy needs ManageNodeTypes, which only the account that initialised the
    // workspace holds; see workspace-theme.spec for why a fresh account would not do.
    const admin: ReturnType<typeof adminCredentials> = adminCredentials();
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await waitForAppReady(page, 60_000);
    expect(await loginAfterDisconnect(page, admin.username, admin.password, null, config.WORKSPACE_SERVER)).toBe(true);
    expect(await waitForWorkspaceLoaded(page, 60_000), 'the workspace should finish loading').toBe(true);
    await closeAnyModals(page);
    expect(hasWorkspaceAdmin(), 'global-setup did not initialise the workspace; no account here can edit it').toBe(true);
  });

  test.afterAll(async () => {
    // Put the default hierarchy back for the specs after this one, whatever happened above.
    await closeAnyModals(page);
    await openEditor(page);
    if (await page.getByTestId(`level-node-${NEW_LEVEL}`).count()) {
      await page.getByTestId(`level-node-${NEW_LEVEL}`).click();
      await page.getByTestId('level-remove').click();
    }
    await page.getByTestId('level-node-Office').click();
    await page.getByTestId('level-label').fill('Office');
    if (await page.getByTestId('save-hierarchy').isEnabled()) await save(page);
    await context.close();
  });

  test('a level dragged from the palette opens in the panel', async () => {
    await openEditor(page);
    await page.getByTestId('palette-new-level').dragTo(page.getByTestId('structure-canvas'));
    await expect(page.getByTestId(`level-node-${NEW_LEVEL}`)).toBeVisible();
    await expect(page.getByTestId('level-panel').locator('h3')).toHaveText(NEW_LEVEL);
    // Not placed yet, so the save is held and says why.
    await expect(page.getByTestId('hierarchy-problem')).toContainText(`Connect ${NEW_LEVEL}`);
  });

  test("an edge drawn from Office's handle lets Office contain it", async () => {
    await connect(page, 'Office', NEW_LEVEL);
    await page.getByTestId('level-node-Office').click();
    await expect(page.getByTestId(`contains-${NEW_LEVEL}`)).toHaveAttribute('data-state', 'checked');
    await expect(page.getByTestId('hierarchy-problem')).toHaveCount(0);
  });

  test('a rename and the new level are saved together and come back from the server', async () => {
    await page.getByTestId('level-label').fill('Department');
    await save(page);
    await closeEditor(page);
    await openEditor(page);
    await expect(page.getByTestId('level-node-Office')).toContainText('Department');
    await expect(page.getByTestId(`level-node-${NEW_LEVEL}`)).toBeVisible();
    await page.getByTestId('level-node-Office').click();
    await expect(page.getByTestId(`contains-${NEW_LEVEL}`)).toHaveAttribute('data-state', 'checked');
    await closeEditor(page);
  });
});
