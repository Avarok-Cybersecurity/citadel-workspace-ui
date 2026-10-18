/**
 * Two people in one Citadel Docs document: what the admin types appears on the member's
 * page, and the admin's caret moves on the member's page when it moves on the admin's.
 *
 * The document is painted, not written into the DOM, so this compares what is painted: the
 * page as each person sees it, screenshotted with the caret and selection layers hidden (the
 * text), and with them shown (the text plus carets). Nothing here reads the editor's state or
 * any test hook; a person comparing the two screens would see the same thing.
 *
 * The member holds ViewContent and not EditMdx, so the member only watches, which is all the
 * Documents relay needs from a reader (Pull, and Awareness).
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { adminMemberTest } from '../fixtures/multi-user.fixture.js';
import { openSelectedNodeMenu, revealNode, selectRoot } from '../lib/focused-tree.js';

const STEP_MS = 30_000;
const SYNC_MS = 60_000;
/** The caret and selection canvases (PageOverlays.tsx), hidden to see the text alone. */
const HIDE_OVERLAYS = 'canvas[data-layer] { visibility: hidden !important; }';

const firstPage = (page: Page): Locator => page.getByRole('group', { name: /^Page 1 of / });
const textOf = (page: Page): Promise<Buffer> => firstPage(page).screenshot({ style: HIDE_OVERLAYS, animations: 'disabled' });
const screenOf = (page: Page): Promise<Buffer> => firstPage(page).screenshot({ animations: 'disabled' });

async function createDocument(page: Page, name: string): Promise<void> {
  const parentId: string | null = (await selectRoot(page)) === null ? null : await openSelectedNodeMenu(page);
  expect(parentId, 'no node menu could be opened to create a document in').not.toBeNull();
  const entry: Locator = page.getByTestId(`new-document-${parentId}`);
  await expect(entry, 'the workspace root offers no new document').not.toHaveAttribute('data-disabled', { timeout: STEP_MS });
  await entry.click();
  const dialog: Locator = page.getByTestId('new-document-dialog');
  await dialog.getByTestId('new-document-app-docs').click();
  // Where the root admits more than one level, the dialog asks which; any one will do.
  const levels: Locator = dialog.getByTestId('new-document-level').getByRole('radio');
  if ((await levels.count()) > 0) await levels.first().click();
  await dialog.getByTestId('new-document-name').fill(name);
  await dialog.getByTestId('new-document-create').click();
  await expect(dialog).toBeHidden({ timeout: STEP_MS });
}

/** Select the document in the sidebar, as a person would, and wait for its pages. */
async function openDocument(page: Page, name: string): Promise<void> {
  expect(await revealNode(page, name, STEP_MS), `"${name}" never appeared in the sidebar`).not.toBeNull();
  await expect(page.getByTestId('document-host')).toHaveAttribute('data-app', 'docs', { timeout: STEP_MS });
  await expect(firstPage(page)).toBeVisible({ timeout: STEP_MS });
}

adminMemberTest('what one person types in a document appears on the other\'s page, with their caret', async ({ admin, member }) => {
  adminMemberTest.setTimeout(300_000);
  const name = `Shared notes ${Date.now()}`;

  await createDocument(admin.page, name);
  await openDocument(admin.page, name);
  // The member opens the same document, before anything is typed.
  await openDocument(member.page, name);
  const blankText: Buffer = await textOf(member.page);

  await firstPage(admin.page).click();
  await admin.page.keyboard.type(`Hello from ${admin.username}`, { delay: 30 });
  const typed: Buffer = await textOf(admin.page);
  expect(typed.equals(blankText), 'the admin\'s own page did not change when typing').toBe(false);

  // The text: the member's page, untouched, comes to paint exactly what the admin's does.
  await expect.poll(async (): Promise<boolean> => (await textOf(member.page)).equals(await textOf(admin.page)), {
    message: 'the member\'s page never showed the admin\'s text',
    timeout: SYNC_MS,
  }).toBe(true);
  expect((await textOf(member.page)).equals(blankText)).toBe(false);

  // The caret: the admin moves it without changing the text. On the member's page the text
  // stays as it is and what is drawn over it moves.
  const textBefore: Buffer = await textOf(member.page);
  const screenBefore: Buffer = await screenOf(member.page);
  await admin.page.keyboard.press('Home');
  await expect.poll(async (): Promise<boolean> => !(await screenOf(member.page)).equals(screenBefore), {
    message: 'the admin\'s caret did not move on the member\'s page',
    timeout: SYNC_MS,
  }).toBe(true);
  expect((await textOf(member.page)).equals(textBefore), 'moving a caret changed the member\'s text').toBe(true);
});
