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

  // Look for the Live Docs section or create button
  const createBtn = page.locator('button:has-text("Create Live Doc"), button:has-text("New Document")').first();

  if (!await isVisibleWithin(createBtn, 5000)) {
    // Try clicking a + button near LIVE DOCS section
    const liveDocsSection = page.locator('text="LIVE DOCS"').first();
    if (await isVisibleWithin(liveDocsSection, 2000)) {
      await liveDocsSection.hover();
      await sleep(500);
      const addBtn = page.locator('button:has(svg.lucide-plus)').first();
      if (await isVisibleWithin(addBtn, 2000)) {
        await addBtn.click();
        await sleep(1000);
      }
    }
  } else {
    await createBtn.click();
    await sleep(1000);
  }

  // Fill in document name if modal appears
  const nameInput = page.locator('input[placeholder*="name"], input[placeholder*="title"]').first();
  if (await isVisibleWithin(nameInput, 3000)) {
    await nameInput.fill(docName);
    await sleep(300);

    const confirmBtn = page.locator('button:has-text("Create"), button:has-text("Save"), button[type="submit"]').first();
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await sleep(2000);
    }
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

  // Look in LIVE DOCS section
  const liveDocsSection = page.locator('text="LIVE DOCS"').locator('..').locator('..');
  const docLink = liveDocsSection.locator(`text="${docName}"`).first();

  if (await isVisibleWithin(docLink, 5000)) {
    await docLink.click();
    await sleep(2000);
    await takeScreenshot(page, `${username}_live_doc_opened`);
    console.log(`  Live Doc "${docName}" opened`);
    return true;
  }

  // Try alternative selectors
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
