/**
 * Two people in one Citadel Docs document: what the admin types appears on the member's
 * page, and the admin's caret moves on the member's page when it moves on the admin's.
 *
 * The document is painted, not written into the DOM, so this looks at what is painted, each
 * person's own page against itself: screenshotted with the caret layers hidden (the text) and
 * shown (the text plus carets). What the text says is read the way the member would read it
 * off the page: by downloading the document as plain text. Nothing here reads the editor's
 * state or any test hook.
 *
 * The member holds ViewContent and not EditMdx, so the member only watches, which is all the
 * Documents relay needs from a reader (Pull, and Awareness).
 */
import { readFileSync } from 'node:fs';
import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { adminMemberTest } from '../fixtures/multi-user.fixture.js';
import { openSelectedNodeMenu, revealNode, selectRoot } from '../lib/focused-tree.js';

const STEP_MS = 30_000;
const SYNC_MS = 60_000;
/**
 * The caret, selection and peer canvases (PageOverlays.tsx), hidden to see the text alone. The
 * text is itself a layer, `data-layer="page"` (PageCanvas.tsx), so it is the one layer kept.
 */
const HIDE_OVERLAYS = 'canvas[data-layer]:not([data-layer="page"]) { visibility: hidden !important; }';

/**
 * The top of the first page, where the typed line is, the same size for both people. Not the
 * whole page: it is taller than the window, and the member's sits lower (under the read-only
 * notice), so a whole-page shot shows each person a different part of it.
 */
const BAND_PX = 220;

const firstPage = (page: Page): Locator => page.getByRole('group', { name: /^Page 1 of / });

async function pageTop(page: Page, style: string | undefined): Promise<Buffer> {
  const box: { x: number; y: number; width: number; height: number } | null = await firstPage(page).boundingBox();
  if (box === null) throw new Error('the first page is not on screen');
  const viewport: { width: number; height: number } | null = page.viewportSize();
  if (viewport !== null && box.y + BAND_PX > viewport.height) throw new Error(`the page top (${box.y}px + ${BAND_PX}px) is below the ${viewport.height}px window`);
  return page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: BAND_PX }, style, animations: 'disabled' });
}

const textOf = (page: Page): Promise<Buffer> => pageTop(page, HIDE_OVERLAYS);
const screenOf = (page: Page): Promise<Buffer> => pageTop(page, undefined);

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

/** The document as the person's own "Download as… → Plain text" writes it. */
async function downloadedText(page: Page): Promise<string> {
  await page.getByTestId('docs-download-as').click();
  const downloaded: Promise<Download> = page.waitForEvent('download', { timeout: STEP_MS });
  await page.getByTestId('docs-download-as-txt').click();
  const path: string | null = await (await downloaded).path();
  expect(path, 'the plain-text download should finish').not.toBeNull();
  return readFileSync(path ?? '', 'utf-8');
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
  const memberBlank: Buffer = await textOf(member.page);
  const adminBlank: Buffer = await textOf(admin.page);

  const line: string = `Hello from ${admin.username}`;
  await firstPage(admin.page).click();
  await admin.page.keyboard.type(line, { delay: 30 });
  await expect.poll(async (): Promise<boolean> => !(await textOf(admin.page)).equals(adminBlank), {
    message: 'the admin\'s own page did not change when typing',
    timeout: STEP_MS,
  }).toBe(true);

  // The text: the member's page, untouched, comes to paint something, and what it says is the
  // admin's line, word for word.
  await expect.poll(async (): Promise<boolean> => !(await textOf(member.page)).equals(memberBlank), {
    message: 'the member\'s page never showed the admin\'s text',
    timeout: SYNC_MS,
  }).toBe(true);
  await expect.poll(async (): Promise<string> => (await downloadedText(member.page)).trim(), {
    message: 'the member\'s copy of the document does not say what the admin typed',
    timeout: SYNC_MS,
  }).toBe(line);

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
