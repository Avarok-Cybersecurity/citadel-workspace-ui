/**
 * Live Document Operations (shared functions for YJS-based live docs)
 */

import type { Page } from 'playwright';
import { sleep } from './utils.js';
import { takeScreenshot } from './screenshots.js';
import { UxIssueTracker } from './ux-tracker.js';
import { isVisibleWithin } from './utils.js';

/**
 * Create a new Live Document
 */
export async function createLiveDoc(
  page: Page,
  username: string,
  docName: string,
  _uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Creating Live Doc "${docName}" ===`);

  // A live document is created from the composer's type selector, not from a
  // "Create Live Doc" button or a "LIVE DOCS" sidebar section. Neither of those
  // strings exists anywhere in the app, and both branches this function used to
  // take were therefore dead: it did nothing at all and then honestly reported
  // that the document was not there.
  const liveDocType = page.getByTestId('message-type-live-doc').first();
  if (!(await isVisibleWithin(liveDocType, 5000))) {
    console.log('  FAIL: the Live Doc composer type is not available here');
    await takeScreenshot(page, `${username}_live_doc_type_missing`);
    return false;
  }
  await liveDocType.click();
  await sleep(500);

  const nameInput = page.getByTestId('live-doc-title').first();
  if (!(await isVisibleWithin(nameInput, 5000))) {
    console.log('  FAIL: the Live Doc dialog did not open');
    await takeScreenshot(page, `${username}_live_doc_dialog_missing`);
    return false;
  }
  await nameInput.fill(docName);
  await sleep(300);
  await page.getByTestId('live-doc-create').first().click();
  await sleep(2000);

  // Every branch above — create button never found, modal never opened, name
  // never entered — used to fall through to `return true`, so this reported
  // success against an app with Live Docs removed entirely. Same shape as the
  // constant `createAccount` return this suite already fixed once.
  const created = page.locator(`text="${docName}"`).first();
  if (!(await isVisibleWithin(created, 5000))) {
    console.log(`  FAIL: Live Doc "${docName}" was not created`);
    await takeScreenshot(page, `${username}_live_doc_not_created`);
    return false;
  }

  await takeScreenshot(page, `${username}_live_doc_created`);
  console.log(`  Live Doc "${docName}" created`);
  return true;
}

/**
 * Open a Live Document by name
 */
export async function openLiveDoc(
  page: Page,
  username: string,
  docName: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Opening Live Doc "${docName}" ===`);

  // A live document arrives in the transcript as a message bubble, not in a
  // "LIVE DOCS" sidebar section -- that section does not exist, so this branch
  // has been dead and every open went through the fallback below, which is the
  // one that was actually doing the work.
  //
  // The document's NAME is legitimate to search for here: it is data this test
  // created, not a label the product chose.
  const altDocLink = page.locator(`button:has-text("${docName}"), a:has-text("${docName}")`).first();
  if (await isVisibleWithin(altDocLink, 3000)) {
    await altDocLink.click();
    await sleep(2000);
    await takeScreenshot(page, `${username}_live_doc_opened`);
    return true;
  }

  if (uxTracker) {
    uxTracker.log('major', 'functional', `Live Doc "${docName}" not found in sidebar`);
  }
  return false;
}

/**
 * Type text into a Live Document editor
 */
export async function typeInLiveDocEditor(
  page: Page,
  username: string,
  text: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Typing in Live Doc editor ===`);

  // Common editor selectors (TipTap, ProseMirror, etc.)
  const editorSelectors = [
    '.ProseMirror',
    '[contenteditable="true"]',
    '.tiptap',
    '.editor-content',
    'div[data-placeholder]',
  ];

  for (const selector of editorSelectors) {
    const editor = page.locator(selector).first();
    if (await isVisibleWithin(editor, 2000)) {
      await editor.click();
      await sleep(300);
      await editor.type(text, { delay: 50 });
      await sleep(500);
      console.log(`  Typed: "${text.substring(0, 50)}..."`);
      await takeScreenshot(page, `${username}_typed_in_editor`);
      return true;
    }
  }

  if (uxTracker) {
    uxTracker.log('critical', 'functional', 'Live Doc editor not found');
  }
  return false;
}

/**
 * Get content from a Live Document editor
 */
export async function getLiveDocContent(page: Page): Promise<string> {
  const editorSelectors = [
    '.ProseMirror',
    '[contenteditable="true"]',
    '.tiptap',
    '.editor-content',
  ];

  for (const selector of editorSelectors) {
    const editor = page.locator(selector).first();
    if (await isVisibleWithin(editor, 2000)) {
      const content = await editor.textContent();
      return content ?? '';
    }
  }

  return '';
}

/**
 * Verify Live Doc content matches expected text
 */
export async function verifyLiveDocContent(
  page: Page,
  username: string,
  expectedText: string,
  timeout = 10000,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Verifying Live Doc content ===`);

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const content = await getLiveDocContent(page);
    if (content.includes(expectedText)) {
      console.log(`  Content verified: "${expectedText.substring(0, 50)}..."`);
      return true;
    }
    await sleep(500);
  }

  if (uxTracker) {
    uxTracker.log('critical', 'functional', `Live Doc content not found within ${timeout}ms: "${expectedText}"`);
  }
  await takeScreenshot(page, `${username}_content_not_found`);
  return false;
}
