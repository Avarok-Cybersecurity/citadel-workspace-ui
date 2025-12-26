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

const testLib = require('./test-lib.cjs');

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
async function createLiveDoc(page, username, docTitle) {
  console.log(`\n=== ${username}: Creating Live Doc "${docTitle}" ===`);

  await testLib.takeScreenshot(page, `${username}_livedoc_01_before`);

  // Click on "Live Doc" type selector button
  const liveDocTypeBtn = page.locator('button[title="Live Doc"]');
  if (await liveDocTypeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await liveDocTypeBtn.click();
    await testLib.sleep(500);
    console.log('  Selected Live Doc message type');
  } else {
    console.log('  WARNING: Live Doc type button not found');
    return false;
  }

  // BUG WORKAROUND: P2PChat.tsx returns early if input is empty BEFORE checking live_document
  const messageInput = page.locator('input[placeholder*="Document content"], input[placeholder*="message"]').first();
  if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await messageInput.fill('initial content');
    await testLib.sleep(300);
    console.log('  Filled input with placeholder text (workaround)');
  }

  // Click the Send button to open LiveDocumentModal
  const sendBtn = page.locator('button[type="submit"]').last();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
    await testLib.sleep(1500);
    console.log('  Clicked Send to open Live Doc modal');
  }

  await testLib.takeScreenshot(page, `${username}_livedoc_02_modal`);

  // Fill in the document title
  const titleInput = page.locator('input[placeholder="Document title..."]');
  if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Found title input, filling...');
    await titleInput.fill(docTitle);
    await testLib.sleep(500);

    // Click "Create & Send" button
    const createBtn = page.locator('button:has-text("Create & Send")');
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      await testLib.sleep(3000);
      console.log('  Document created!');
    } else {
      const altCreateBtn = page.locator('button:has-text("Create")');
      if (await altCreateBtn.isVisible()) {
        await altCreateBtn.click();
        await testLib.sleep(3000);
      }
    }
  } else {
    console.log('  WARNING: Title input not found in Live Doc modal');
    await testLib.takeScreenshot(page, `${username}_livedoc_02b_modal_debug`);
    return false;
  }

  await testLib.takeScreenshot(page, `${username}_livedoc_03_created`);
  console.log(`  Live Doc "${docTitle}" creation completed`);
  return true;
}

/**
 * Type text in the ProseMirror editor
 */
async function typeInEditor(page, username, text) {
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
    } catch (e) {
      // timeout
    }
    console.log(`  Waiting for editor... (${attempt + 1}/20)`);
    await testLib.sleep(500);
  }

  if (editorFound) {
    try {
      console.log(`  Attempting to click editor...`);
      await editor.click({ force: true, timeout: 5000 });
      await testLib.sleep(500);
      console.log(`  Typing text...`);
      await page.keyboard.type(text, { delay: 30 });
      await testLib.sleep(1000);
      console.log(`  Typed text successfully`);
    } catch (clickError) {
      console.log(`  Click failed, trying focus approach: ${clickError.message}`);
      try {
        await editor.focus();
        await testLib.sleep(300);
        await page.keyboard.type(text, { delay: 30 });
        await testLib.sleep(1000);
        console.log(`  Typed text via focus approach`);
      } catch (focusError) {
        console.log(`  Focus approach also failed: ${focusError.message}`);
        await testLib.takeScreenshot(page, `${username}_type_failed`);
        return false;
      }
    }
  } else {
    console.log(`  WARNING: Editor (.ProseMirror) not found after 20 seconds`);
    const allEditors = await page.locator('.ProseMirror').count();
    console.log(`  Total .ProseMirror elements on page: ${allEditors}`);
    await testLib.takeScreenshot(page, `${username}_editor_not_found`);
    return false;
  }

  await testLib.takeScreenshot(page, `${username}_typed`);
  return true;
}

/**
 * Get content from the ProseMirror editor
 */
async function getEditorContent(page) {
  const editor = page.locator('.ProseMirror').first();
  if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
    return await editor.textContent() || '';
  }
  return '';
}

/**
 * Open a Live Doc tab in the chat
 */
async function openLiveDocTab(page, username, docTitle) {
  console.log(`\n=== ${username}: Opening Live Doc tab ===`);

  // Look for tab with document title
  const docTab = page.locator(`button:has-text("${docTitle}")`).first();
  if (await docTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await docTab.click();
    await testLib.sleep(2000);
    console.log(`  Opened Live Doc tab: ${docTitle}`);
    await testLib.takeScreenshot(page, `${username}_livedoc_opened`);
    return true;
  }

  // Try any tab with a FileText icon
  const anyDocTab = page.locator('button:has(svg.lucide-file-text)').first();
  if (await anyDocTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await anyDocTab.click();
    await testLib.sleep(2000);
    console.log(`  Opened a Live Doc tab`);
    await testLib.takeScreenshot(page, `${username}_livedoc_opened`);
    return true;
  }

  console.log(`  WARNING: Live Doc tab not found`);
  return false;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest() {
  console.log('='.repeat(60));
  console.log('LIVE DOC BIDIRECTIONAL SYNC TEST');
  console.log('='.repeat(60));
  console.log(`User 1: ${USER1}`);
  console.log(`User 2: ${USER2}`);
  console.log(`Document: ${DOC_TITLE}`);
  console.log('');

  // Initialize
  testLib.ensureScreenshotsDir(true); // Clean screenshots dir

  // Wait for services
  await testLib.waitForServicesAlive();

  // Setup browser
  const { browser, context } = await testLib.createBrowser({ headless: false, slowMo: 100 });

  try {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Capture YJS-related logs
    const logs1 = testLib.setupConsoleCapture(page1, 'User1', ['Yjs', 'sync', 'Sync', 'P2P']);
    const logs2 = testLib.setupConsoleCapture(page2, 'User2', ['Yjs', 'sync', 'Sync', 'P2P']);

    // ========== STEP 1: Create accounts ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('─'.repeat(50));

    await testLib.createAccount(page1, USER1, { isFirstUser: true });
    await testLib.createAccount(page2, USER2, { isFirstUser: false });

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('─'.repeat(50));

    await testLib.p2pRegister(page1, USER1, USER2);

    // ========== STEP 3: Accept P2P Request ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Accept P2P Request');
    console.log('─'.repeat(50));

    await testLib.sleep(3000);
    const accepted = await testLib.acceptP2PRequest(page2, USER2);
    if (!accepted) {
      console.log('\n  P2P request may not have been accepted - continuing anyway');
    }

    // Wait for P2P connection
    console.log('\n  Waiting for P2P connection to establish...');
    await testLib.sleep(5000);

    // ========== STEP 4: Open Conversations ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Open Conversations');
    console.log('─'.repeat(50));

    await testLib.openConversation(page1, USER1, USER2);

    // ========== STEP 5: Create Live Doc ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Create Live Document');
    console.log('─'.repeat(50));

    const docCreated = await createLiveDoc(page1, USER1, DOC_TITLE);

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

    await testLib.openConversation(page2, USER2, USER1);
    await testLib.sleep(2000);
    await openLiveDocTab(page2, USER2, DOC_TITLE);

    // ========== STEP 8: Verify Sync (User 1 -> User 2) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 8: Verify Sync (User 1 -> User 2)');
    console.log('─'.repeat(50));

    console.log('  Waiting for YJS sync...');
    await testLib.sleep(5000);
    const content2 = await getEditorContent(page2);

    console.log(`\n${'='.repeat(40)}`);
    console.log('VERIFICATION RESULTS');
    console.log('='.repeat(40));
    console.log(`User 2 editor content: "${content2}"`);

    let testPassed = true;
    if (content2.includes(TEXT1) || content2.includes('Hello')) {
      console.log('  PASS: User 2 received User 1\'s text');
    } else {
      console.log('  FAIL: User 2 did NOT receive User 1\'s text');
      testPassed = false;
    }

    // ========== STEP 9: User 2 Types Text ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 9: User 2 Types Text');
    console.log('─'.repeat(50));

    const TEXT2 = ' And hello from User 2!';
    await testLib.takeScreenshot(page2, `${USER2}_before_typing`);
    await typeInEditor(page2, USER2, TEXT2);

    // ========== STEP 10: Verify Reverse Sync ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 10: Verify Reverse Sync');
    console.log('─'.repeat(50));

    console.log('  Waiting for reverse sync...');
    await testLib.sleep(5000);
    const content1 = await getEditorContent(page1);
    console.log(`User 1 editor content: "${content1}"`);

    if (content1.includes('User 2') || content1.includes('hello from User 2')) {
      console.log('  PASS: User 1 received User 2\'s text (bidirectional sync works!)');
    } else {
      console.log('  FAIL: User 1 did NOT receive User 2\'s text');
      testPassed = false;
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
    await testLib.takeScreenshot(page1, 'FINAL_user1');
    await testLib.takeScreenshot(page2, 'FINAL_user2');

    // ========== RESULTS ==========
    console.log(`\n${'='.repeat(40)}`);
    console.log(`TEST ${testPassed ? 'PASSED' : 'FAILED'}`);
    console.log('='.repeat(40));

    // Write report
    testLib.writeTestReport('LIVE_DOC_TEST_REPORT.json', {
      users: { user1: USER1, user2: USER2 },
      document: DOC_TITLE,
      results: {
        accountCreation: true,
        p2pRegistration: true,
        p2pAccept: accepted,
        docCreated,
        user1ToUser2Sync: content2.includes('Hello'),
        user2ToUser1Sync: content1.includes('User 2'),
      },
      passed: testPassed,
    });

    console.log('\nCheck screenshots directory for visual verification');
    console.log('Browser will remain open for 30 seconds for manual inspection...');
    await testLib.sleep(30000);

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

runTest().then(passed => {
  process.exit(passed ? 0 : 1);
}).catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
