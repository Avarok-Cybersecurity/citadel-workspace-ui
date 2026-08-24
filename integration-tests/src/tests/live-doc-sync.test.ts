/**
 * Live Doc Bidirectional Sync Test
 *
 * Tests the YJS P2P sync protocol:
 * 1. Create two users
 * 2. P2P register them
 * 3. User 1 creates Live Doc, types text
 * 4. User 2 opens Live Doc, verifies sees User 1's text
 * 5. User 2 types text
 * 6. User 1 verifies sees both texts
 */

import { Page } from 'playwright';
import {
  sleep,
  createSeparateBrowsers,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  takeScreenshot,
  setupConsoleCapture,
  TestHarness,
  runTestMain,
} from '../test-lib.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface LiveDocTestResults {
  accountCreation: boolean;
  p2pRegistration: boolean;
  p2pAccept: boolean;
  docCreated: boolean;
  user1ToUser2Sync: boolean;
  user2ToUser1Sync: boolean;
  // P12 addition: LiveDocumentBubble verification
  liveDocBubbleVisible: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `livedoc_a_${timestamp}`;
const USER2 = `livedoc_b_${timestamp}`;
const DOC_TITLE = `TestDoc_${timestamp}`;

// ============================================================================
// Live Doc Specific Functions
// ============================================================================

/**
 * Create a new Live Doc in the current conversation
 */
async function createLiveDoc(page: Page, username: string, docTitle: string): Promise<boolean> {
  console.log(`\n=== ${username}: Creating Live Doc "${docTitle}" ===`);

  await takeScreenshot(page, `${username}_livedoc_01_before`);

  // Click on "Live Doc" type selector button
  const liveDocTypeBtn = page.locator('button[title="Live Doc"]');
  if (await isVisibleWithin(liveDocTypeBtn, 3000)) {
    await liveDocTypeBtn.click();
    await sleep(500);
    console.log('  Selected Live Doc message type');
  } else {
    console.log('  WARNING: Live Doc type button not found');
    return false;
  }

  // BUG WORKAROUND: P2PChat.tsx returns early if input is empty BEFORE checking live_document
  const messageInput = page.locator('input[placeholder*="Document content"], input[placeholder*="message"]').first();
  if (await isVisibleWithin(messageInput, 2000)) {
    await messageInput.fill('initial content');
    await sleep(300);
    console.log('  Filled input with placeholder text (workaround)');
  }

  // Click the Send button to open LiveDocumentModal
  const sendBtn = page.locator('button[type="submit"]').last();
  if (await isVisibleWithin(sendBtn, 2000)) {
    await sendBtn.click();
    await sleep(1500);
    console.log('  Clicked Send to open Live Doc modal');
  }

  await takeScreenshot(page, `${username}_livedoc_02_modal`);

  // Fill in the document title
  const titleInput = page.locator('input[placeholder="Document title..."]');
  if (await isVisibleWithin(titleInput, 3000)) {
    console.log('  Found title input, filling...');
    await titleInput.fill(docTitle);
    await sleep(500);

    // Click "Create & Send" button
    const createBtn = page.locator('button:has-text("Create & Send")');
    if (await isVisibleWithin(createBtn, 2000)) {
      await createBtn.click();
      await sleep(3000);
      console.log('  Document created!');
    } else {
      const altCreateBtn = page.locator('button:has-text("Create")');
      if (await altCreateBtn.isVisible()) {
        await altCreateBtn.click();
        await sleep(3000);
      }
    }
  } else {
    console.log('  WARNING: Title input not found in Live Doc modal');
    await takeScreenshot(page, `${username}_livedoc_02b_modal_debug`);
    return false;
  }

  await takeScreenshot(page, `${username}_livedoc_03_created`);
  console.log(`  Live Doc "${docTitle}" creation completed`);
  return true;
}

/**
 * Type text in the ProseMirror editor
 */
async function typeInEditor(page: Page, username: string, text: string): Promise<boolean> {
  console.log(`\n=== ${username}: Typing "${text}" ===`);

  const url = page.url();
  console.log(`  Page URL: ${url}`);

  // Wait for TipTap/ProseMirror editor
  const editor = page.locator('.ProseMirror').first();

  let editorFound = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const visible = await editor.isVisible({ timeout: 1000 });
      if (visible) {
        console.log(`  Editor found after ${attempt + 1} seconds`);
        editorFound = true;
        break;
      }
    } catch {
      // timeout
    }
    console.log(`  Waiting for editor... (${attempt + 1}/20)`);
    await sleep(500);
  }

  if (editorFound) {
    try {
      console.log(`  Attempting to click editor...`);
      await editor.click({ force: true, timeout: 5000 });
      await sleep(500);
      console.log(`  Typing text...`);
      await page.keyboard.type(text, { delay: 30 });
      await sleep(1000);
      console.log(`  Typed text successfully`);
    } catch (clickError) {
      const error = clickError as Error;
      console.log(`  Click failed, trying focus approach: ${error.message}`);
      try {
        await editor.focus();
        await sleep(300);
        await page.keyboard.type(text, { delay: 30 });
        await sleep(1000);
        console.log(`  Typed text via focus approach`);
      } catch (focusError) {
        const fError = focusError as Error;
        console.log(`  Focus approach also failed: ${fError.message}`);
        await takeScreenshot(page, `${username}_type_failed`);
        return false;
      }
    }
  } else {
    console.log(`  WARNING: Editor (.ProseMirror) not found after 20 seconds`);
    const allEditors = await page.locator('.ProseMirror').count();
    console.log(`  Total .ProseMirror elements on page: ${allEditors}`);
    await takeScreenshot(page, `${username}_editor_not_found`);
    return false;
  }

  await takeScreenshot(page, `${username}_typed`);
  return true;
}

/**
 * Get content from the ProseMirror editor
 */
/**
 * Wait for `text` to appear in the collaborative editor.
 *
 * Polls the editor's own content rather than using a locator, because the text
 * arrives inside ProseMirror's managed DOM and the assertion is about the
 * document's value, not about any one element rendering.
 */
async function waitForEditorText(page: Page, text: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await getEditorContent(page)).includes(text)) return true;
    await sleep(500);
  }
  return false;
}

async function getEditorContent(page: Page): Promise<string> {
  const editor = page.locator('.ProseMirror').first();
  if (await isVisibleWithin(editor, 3000)) {
    const content = await editor.textContent();
    return content ?? '';
  }
  return '';
}

/**
 * Open a Live Doc tab in the chat
 */
async function openLiveDocTab(page: Page, username: string, docTitle: string): Promise<boolean> {
  console.log(`\n=== ${username}: Opening Live Doc tab ===`);

  // Look for tab with document title
  const docTab = page.locator(`button:has-text("${docTitle}")`).first();
  if (await isVisibleWithin(docTab, 5000)) {
    await docTab.click();
    await sleep(2000);
    console.log(`  Opened Live Doc tab: ${docTitle}`);
    await takeScreenshot(page, `${username}_livedoc_opened`);
    return true;
  }

  // Try any tab with a FileText icon
  const anyDocTab = page.locator('button:has(svg.lucide-file-text)').first();
  if (await isVisibleWithin(anyDocTab, 2000)) {
    await anyDocTab.click();
    await sleep(2000);
    console.log(`  Opened a Live Doc tab`);
    await takeScreenshot(page, `${username}_livedoc_opened`);
    return true;
  }

  console.log(`  WARNING: Live Doc tab not found`);
  return false;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  // Initialize test harness
  const harness = await TestHarness.create({
    testName: 'Live Doc Bidirectional Sync Test',
    reportFileName: 'LIVE_DOC_TEST_REPORT.json',
    metadata: { user1: USER1, user2: USER2, docTitle: DOC_TITLE },
  });

  // Setup separate browser contexts so each user is its own leader tab
  // (shared context causes leader/follower deadlock when lower-CID user is leader)
  const { pages: [page1, page2], cleanup } = await createSeparateBrowsers(2);

  const results: LiveDocTestResults = {
    accountCreation: false,
    p2pRegistration: false,
    p2pAccept: false,
    docCreated: false,
    user1ToUser2Sync: false,
    user2ToUser1Sync: false,
    liveDocBubbleVisible: false,
  };

  try {
    // Capture YJS-related logs
    const logs1 = setupConsoleCapture(page1, 'User1', ['Yjs', 'sync', 'Sync', 'P2P']);
    const logs2 = setupConsoleCapture(page2, 'User2', ['Yjs', 'sync', 'Sync', 'P2P']);

    // ========== STEP 1: Create accounts ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('─'.repeat(50));

    await createAccount(page1, USER1, { isFirstUser: true });
    await createAccount(page2, USER2, { isFirstUser: false });
    results.accountCreation = true;

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('─'.repeat(50));

    results.p2pRegistration = await p2pRegister(page1, USER1, USER2);

    // ========== STEP 3: Accept P2P Request ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Accept P2P Request');
    console.log('─'.repeat(50));

    await sleep(3000);
    results.p2pAccept = await acceptP2PRequest(page2, USER2);
    if (!results.p2pAccept) {
      console.log('\n  P2P request may not have been accepted - continuing anyway');
    }

    // Wait for P2P connection
    console.log('\n  Waiting for P2P connection to establish...');
    await sleep(5000);

    // ========== STEP 4: Open Conversations ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Open Conversations');
    console.log('─'.repeat(50));

    await openConversation(page1, USER1, USER2);

    // ========== STEP 5: Create Live Doc ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Create Live Document');
    console.log('─'.repeat(50));

    results.docCreated = await createLiveDoc(page1, USER1, DOC_TITLE);

    // ========== STEP 5b: Verify LiveDocumentBubble (P12) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5b: Verify LiveDocumentBubble in Chat (P12)');
    console.log('─'.repeat(50));

    // After creating the live doc, a LiveDocumentBubble should appear in the message list
    // Look for the bubble with the document title or a FileText icon
    const liveDocBubble = page1.locator(`button:has-text("${DOC_TITLE}"), [class*="live-doc"], [class*="LiveDoc"], [data-message-type="live_document"]`).first();
    results.liveDocBubbleVisible = await isVisibleWithin(liveDocBubble, 5000);

    if (!results.liveDocBubbleVisible) {
      // Alternative: look for any bubble with FileText icon in message area
      const fileTextBubble = page1.locator('button:has(svg.lucide-file-text)').first();
      results.liveDocBubbleVisible = await isVisibleWithin(fileTextBubble, 3000);
    }

    console.log(`  LiveDocumentBubble visible: ${results.liveDocBubbleVisible}`);
    await takeScreenshot(page1, `${USER1}_livedoc_bubble`);

    // ========== STEP 6: User 1 Types Text ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: User 1 Types Text');
    console.log('─'.repeat(50));

    // Unique per run. The document can outlive a run, so a fixed string like
    // "Hello from User 1!" could still be sitting in it from last time and the
    // sync check would pass without anything having synced now.
    const RUN = Date.now().toString(36);
    const TEXT1 = `Hello from User 1 [${RUN}]`;
    await typeInEditor(page1, USER1, TEXT1);

    // ========== STEP 7: User 2 Opens Live Doc ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: User 2 Opens Live Doc');
    console.log('─'.repeat(50));

    await openConversation(page2, USER2, USER1);
    await sleep(2000);
    await openLiveDocTab(page2, USER2, DOC_TITLE);

    // ========== STEP 8: Verify Sync (User 1 -> User 2) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 8: Verify Sync (User 1 -> User 2)');
    console.log('─'.repeat(50));

    // Wait for the text to arrive rather than sleeping a fixed 5s: it returns as
    // soon as sync lands, and on failure it has genuinely waited the full budget
    // instead of giving up at exactly 5s.
    console.log('  Waiting for YJS sync...');
    const arrivedAt2 = await waitForEditorText(page2, TEXT1, 20_000);
    const content2 = await getEditorContent(page2);

    console.log(`\n${'='.repeat(40)}`);
    console.log('VERIFICATION RESULTS');
    console.log('='.repeat(40));
    console.log(`User 2 editor content: "${content2}"`);

    // Only the exact marker counts. The old check also accepted the substring
    // 'Hello', which any greeting in the document would satisfy.
    if (arrivedAt2) {
      console.log('  PASS: User 2 received User 1\'s text');
      results.user1ToUser2Sync = true;
    } else {
      console.log('  FAIL: User 2 did NOT receive User 1\'s text');
    }

    // ========== STEP 9: User 2 Types Text ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 9: User 2 Types Text');
    console.log('─'.repeat(50));

    const TEXT2 = ` And hello from User 2 [${RUN}]`;
    await takeScreenshot(page2, `${USER2}_before_typing`);
    await typeInEditor(page2, USER2, TEXT2);

    // ========== STEP 10: Verify Reverse Sync ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 10: Verify Reverse Sync');
    console.log('─'.repeat(50));

    console.log('  Waiting for reverse sync...');
    const arrivedAt1 = await waitForEditorText(page1, TEXT2.trim(), 20_000);
    const content1 = await getEditorContent(page1);
    console.log(`User 1 editor content: "${content1}"`);

    if (arrivedAt1) {
      console.log('  PASS: User 1 received User 2\'s text (bidirectional sync works!)');
      results.user2ToUser1Sync = true;
    } else {
      console.log('  FAIL: User 1 did NOT receive User 2\'s text');
    }

    // Print YJS logs summary
    console.log(`\n${'='.repeat(40)}`);
    console.log('YJS CONSOLE LOGS');
    console.log('='.repeat(40));
    console.log('\nUser 1 Yjs logs:');
    logs1.slice(-20).forEach(log => console.log(`  ${log}`));
    console.log('\nUser 2 Yjs logs:');
    logs2.slice(-20).forEach(log => console.log(`  ${log}`));

    // Final screenshots
    await takeScreenshot(page1, 'FINAL_user1');
    await takeScreenshot(page2, 'FINAL_user2');

    // Log P12 result
    console.log(`\nLiveDocumentBubble (P12): ${results.liveDocBubbleVisible ? 'PASS' : 'CHECK'}`);

    // ========== RESULTS ==========
    const testPassed = results.user1ToUser2Sync && results.user2ToUser1Sync;

    console.log(`\n${'='.repeat(40)}`);
    console.log(`TEST ${testPassed ? 'PASSED' : 'FAILED'}`);
    console.log('='.repeat(40));

    // Finalize test harness with results
    harness.finalize(testPassed, {
      ...results,
      content1Final: content1,
      content2Final: content2,
    } as unknown as Record<string, any>);

    console.log('\nCheck screenshots directory for visual verification');

    return testPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    throw error;
  } finally {
    await cleanup();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
