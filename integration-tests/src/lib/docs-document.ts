/**
 * A Citadel Docs document as a person reaches it: created from a node's menu, opened from the
 * sidebar, and read back through "Download as… → Plain text". Shared by the Docs specs.
 */
import { readFileSync } from 'node:fs';
import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { openSelectedNodeMenu, revealNode, selectRoot } from './focused-tree.js';

const STEP_MS = 30_000;

export const firstPage = (page: Page): Locator => page.getByRole('group', { name: /^Page 1 of / });

export async function createDocument(page: Page, name: string): Promise<void> {
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
export async function downloadedText(page: Page): Promise<string> {
  await page.getByTestId('docs-download-as').click();
  const downloaded: Promise<Download> = page.waitForEvent('download', { timeout: STEP_MS });
  await page.getByTestId('docs-download-as-txt').click();
  const path: string | null = await (await downloaded).path();
  expect(path, 'the plain-text download should finish').not.toBeNull();
  return readFileSync(path ?? '', 'utf-8');
}

/** Select the document in the sidebar, as a person would, and wait for its pages. */
export async function openDocument(page: Page, name: string): Promise<void> {
  expect(await revealNode(page, name, STEP_MS), `"${name}" never appeared in the sidebar`).not.toBeNull();
  await expect(page.getByTestId('document-host')).toHaveAttribute('data-app', 'docs', { timeout: STEP_MS });
  await expect(firstPage(page)).toBeVisible({ timeout: STEP_MS });
}
