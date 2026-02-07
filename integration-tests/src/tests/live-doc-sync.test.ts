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
  createBrowser,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  takeScreenshot,
  setupConsoleCapture,
  TestHarness,
  runTestMain,
} from '../test-lib.js';

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
  if (await liveDocTypeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await liveDocTypeBtn.click();
    await sleep(500);
    console.log('  Selected Live Doc message type');
  } else {
    console.log('  WARNING: Live Doc type button not found');
    return false;
  }

  // BUG WORKAROUND: P2PChat.tsx returns early if input is empty BEFORE checking live_document
  const messageInput = page.locator('input[placeholder*="Document content"], input[placeholder*="message"]').first();
  if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await messageInput.fill('initial content');
    await sleep(300);
    console.log('  Filled input with placeholder text (workaround)');
  }

  // Click the Send button to open LiveDocumentModal
  const sendBtn = page.locator('button[type="submit"]').last();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
    await sleep(1500);
    console.log('  Clicked Send to open Live Doc modal');
  }

  await takeScreenshot(page, `${username}_livedoc_02_modal`);

  // Fill in the document title
  const titleInput = page.locator('input[placeholder="Document title..."]');
  if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Found title input, filling...');
    await titleInput.fill(docTitle);
    await sleep(500);

    // Click "Create & Send" button
    const createBtn = page.locator('button:has-text("Create & Send")');
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
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
async function getEditorContent(page: Page): Promise<string> {
  const editor = page.locator('.ProseMirror').first();
  if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
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
  if (await docTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await docTab.click();
    await sleep(2000);
    console.log(`  Opened Live Doc tab: ${docTitle}`);
    await takeScreenshot(page, `${username}_livedoc_opened`);
    return true;
  }

  // Try any tab with a FileText icon
  const anyDocTab = page.locator('button:has(svg.lucide-file-text)').first();
  if (await anyDocTab.isVisible({ timeout: 2000 }).catch(() => false)) {
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

  // Setup browser
  const { browser, context } = await createBrowser({ slowMo: 100 });

  const results: LiveDocTestResults = {
    accountCreation: false,
    p2pRegistration: false,
    p2pAccept: false,
    docCreated: false,
    user1ToUser2Sync: false,
    user2ToUser1Sync: false,
  };

  try {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

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

    // ========== STEP 6: User 1 Types Text ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: User 1 Types Text');
    console.log('─'.repeat(50));

    const TEXT1 = 'Hello from User 1!';
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

    console.log('  Waiting for YJS sync...');
    await sleep(5000);
    const content2 = await getEditorContent(page2);

    console.log(`\n${'='.repeat(40)}`);
    console.log('VERIFICATION RESULTS');
    console.log('='.repeat(40));
    console.log(`User 2 editor content: "${content2}"`);

    if (content2.includes(TEXT1) || content2.includes('Hello')) {
      console.log('  PASS: User 2 received User 1\'s text');
      results.user1ToUser2Sync = true;
    } else {
      console.log('  FAIL: User 2 did NOT receive User 1\'s text');
    }

    // ========== STEP 9: User 2 Types Text ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 9: User 2 Types Text');
    console.log('─'.repeat(50));

    const TEXT2 = ' And hello from User 2!';
    await takeScreenshot(page2, `${USER2}_before_typing`);
    await typeInEditor(page2, USER2, TEXT2);

    // ========== STEP 10: Verify Reverse Sync ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 10: Verify Reverse Sync');
    console.log('─'.repeat(50));

    console.log('  Waiting for reverse sync...');
    await sleep(5000);
    const content1 = await getEditorContent(page1);
    console.log(`User 1 editor content: "${content1}"`);

    if (content1.includes('User 2') || content1.includes('hello from User 2')) {
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
    console.log('Browser will remain open for 30 seconds for manual inspection...');
    await sleep(30000);

    return testPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
