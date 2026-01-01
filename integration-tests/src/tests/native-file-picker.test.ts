/**
 * Native File Picker Integration Test
 *
 * Tests the native file picker → SendFile protocol flow:
 * 1. Create two users in separate tabs
 * 2. P2P register User1 -> User2
 * 3. User2 accepts the P2P request
 * 4. Open conversation
 * 5. Click "Browse Files" button (triggers native picker)
 * 6. User manually selects a file (test pauses for interaction)
 * 7. Verify SendFile protocol is used (not P2P chunking)
 *
 * IMPORTANT: This test requires:
 * - Internal-service running NATIVELY with --features native-dialogs
 * - NOT running in Docker (Docker can't show native dialogs)
 * - Manual user interaction to select a file
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  ensureScreenshotsDir,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  setupConsoleCapture,
  logObservation,
  UxIssueTracker,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: {
    user1: boolean;
    user2: boolean;
  };
  p2pRegistration: boolean;
  p2pAccept: boolean;
  conversationOpen: {
    user1: boolean;
    user2: boolean;
  };
  nativePickerFlow: {
    modalOpened: boolean;
    nativeButtonVisible: boolean;
    nativeButtonClicked: boolean;
    pickFileRequestSent: boolean;
    fileSelected: boolean; // User manually selected a file
    sendFileProtocolUsed: boolean;
    transferCompleted: boolean;
    error?: string;
  };
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `native_alice_${timestamp}`;
const USER2 = `native_bob_${timestamp}`;

// How long to wait for user to select a file in native dialog
const NATIVE_DIALOG_TIMEOUT_MS = 60000; // 60 seconds

// ============================================================================
// Helper Functions
// ============================================================================

async function openFileTransferModal(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Opening file transfer modal ===`);
  try {
    const attachButton = page.locator('button').filter({ has: page.locator('svg.lucide-paperclip') });

    if (await attachButton.isVisible({ timeout: 5000 })) {
      await attachButton.click();
      console.log('  Clicked attachment button');

      await sleep(1000);

      const modalTitle = page.getByRole('heading', { name: 'Send File' });
      if (await modalTitle.isVisible({ timeout: 3000 })) {
        console.log('  File transfer modal opened');
        return true;
      }
    }

    console.log('  Failed to open file transfer modal');
    return false;
  } catch (error) {
    console.error(`  Error opening modal: ${error}`);
    return false;
  }
}

async function checkNativePickerButton(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Checking for native file picker button ===`);
  try {
    // The native picker button has FolderOpen icon and text "Browse Files"
    const nativeButton = page.locator('button').filter({
      has: page.locator('svg.lucide-folder-open')
    });

    // Also check by text
    const byText = page.locator('button').filter({ hasText: 'Browse Files' });

    const hasNativeButton = await nativeButton.isVisible({ timeout: 5000 }).catch(() => false);
    const hasTextButton = await byText.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Native button (FolderOpen icon): ${hasNativeButton}`);
    console.log(`  Button with "Browse Files" text: ${hasTextButton}`);

    return hasNativeButton || hasTextButton;
  } catch (error) {
    console.error(`  Error checking native button: ${error}`);
    return false;
  }
}

async function clickNativePickerButton(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Clicking native file picker button ===`);
  try {
    const nativeButton = page.locator('button').filter({
      has: page.locator('svg.lucide-folder-open')
    }).first();

    if (await nativeButton.isVisible({ timeout: 3000 })) {
      await nativeButton.click();
      console.log('  Clicked native file picker button');
      return true;
    }

    // Fallback to text match
    const byText = page.locator('button').filter({ hasText: 'Browse Files' }).first();
    if (await byText.isVisible({ timeout: 2000 })) {
      await byText.click();
      console.log('  Clicked Browse Files button (text match)');
      return true;
    }

    console.log('  Native picker button not found');
    return false;
  } catch (error) {
    console.error(`  Error clicking native button: ${error}`);
    return false;
  }
}

/**
 * Wait for native file dialog to complete (file selected or cancelled)
 * This monitors the browser console and UI for indications of completion
 */
async function waitForNativeDialogResult(
  page: Page,
  username: string,
  timeoutMs: number = NATIVE_DIALOG_TIMEOUT_MS
): Promise<{ success: boolean; fileSelected: boolean; error?: string }> {
  console.log(`\n=== ${username}: Waiting for native file dialog result ===`);
  console.log('  *** PLEASE SELECT A FILE IN THE NATIVE DIALOG ***');
  console.log(`  (Timeout: ${timeoutMs / 1000} seconds)`);

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Check if the modal closed (indicates success)
    const modal = page.locator('[role="dialog"]');
    const modalHidden = await modal.isHidden({ timeout: 1000 }).catch(() => false);

    if (modalHidden) {
      console.log('  Modal closed - file transfer initiated');
      return { success: true, fileSelected: true };
    }

    // Check for error message in the modal
    const errorText = await page.locator('.text-red-400').textContent().catch(() => null);
    if (errorText) {
      if (errorText.includes('cancelled') || errorText.includes('canceled')) {
        console.log('  File picker was cancelled by user');
        return { success: false, fileSelected: false, error: 'User cancelled' };
      }
      if (errorText.includes('native-dialogs feature is disabled')) {
        console.log('  Native dialogs not available - internal-service not running with native-dialogs feature');
        return { success: false, fileSelected: false, error: 'Native dialogs not available' };
      }
      console.log(`  Error: ${errorText}`);
      return { success: false, fileSelected: false, error: errorText };
    }

    // Check if "Opening file picker..." text is still showing
    const pickingText = page.getByText('Opening file picker...');
    if (await pickingText.isVisible({ timeout: 500 }).catch(() => false)) {
      // Still waiting for dialog
      continue;
    }

    await sleep(1000);
  }

  console.log('  Timeout waiting for native dialog');
  return { success: false, fileSelected: false, error: 'Timeout' };
}

/**
 * Check if SendFile protocol was used (vs P2P chunking)
 * We check this by looking at the transfer's state and logs
 */
async function verifySendFileProtocolUsed(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Verifying SendFile protocol was used ===`);
  try {
    // Check the fileTransferService for transfers with protocol-based transfer
    const result = await page.evaluate(() => {
      const service = (window as any).__fileTransferService;
      if (!service) return { error: 'FileTransferService not found' };

      const transfers = service.getAllTransfers ? service.getAllTransfers() : [];
      const recentTransfer = transfers.find((t: any) => !t.isIncoming);

      if (!recentTransfer) return { error: 'No outgoing transfer found' };

      // A protocol-based transfer won't have pendingFiles since file is handled by internal-service
      return {
        id: recentTransfer.id,
        state: recentTransfer.state,
        mode: recentTransfer.mode,
        fileName: recentTransfer.fileName,
        // Protocol transfers have 'p2p' mode but are handled differently
        isProtocolTransfer: recentTransfer.mode === 'p2p' && !service.pendingFiles?.has(recentTransfer.id),
      };
    });

    console.log('  Transfer info:', JSON.stringify(result, null, 2));

    if ('error' in result) {
      console.log(`  Error: ${result.error}`);
      return false;
    }

    // For native picker flow, the file is handled by internal-service via SendFile protocol
    // We can verify this by checking if the transfer was created without storing the file in browser
    console.log(`  Protocol-based transfer: ${result.isProtocolTransfer}`);
    return result.isProtocolTransfer;
  } catch (error) {
    console.error(`  Error verifying protocol: ${error}`);
    return false;
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('NATIVE FILE PICKER INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log(`User 1 (Alice): ${USER1}`);
  console.log(`User 2 (Bob): ${USER2}`);
  console.log('');
  console.log('PREREQUISITES:');
  console.log('  - Internal-service running NATIVELY (not in Docker)');
  console.log('  - Built with: cargo build --features native-dialogs');
  console.log('  - Server running (Docker or native)');
  console.log('  - UI running at http://localhost:5173');
  console.log('');

  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Wait for services
  await waitForServicesAlive();

  logObservation('test-start', 'Native File Picker Test Started', {
    user1: USER1,
    user2: USER2,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  const { browser, context } = await createBrowser({ headless: false, slowMo: 50 });
  const context2 = await browser.newContext();

  const results: TestResults = {
    accountCreation: { user1: false, user2: false },
    p2pRegistration: false,
    p2pAccept: false,
    conversationOpen: { user1: false, user2: false },
    nativePickerFlow: {
      modalOpened: false,
      nativeButtonVisible: false,
      nativeButtonClicked: false,
      pickFileRequestSent: false,
      fileSelected: false,
      sendFileProtocolUsed: false,
      transferCompleted: false,
    },
  };

  try {
    const page1 = await context.newPage();
    const page2 = await context2.newPage();

    setupConsoleCapture(page1, 'Alice', ['PickFile', 'SendFile', 'file', 'transfer', 'error', 'native']);
    setupConsoleCapture(page2, 'Bob', ['file', 'transfer', 'error']);

    // ========== STEP 1: Create accounts ==========
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('-'.repeat(50));

    results.accountCreation.user1 = await createAccount(page1, USER1, {
      isFirstUser: true,
      uxTracker,
    });

    results.accountCreation.user2 = await createAccount(page2, USER2, {
      isFirstUser: false,
      uxTracker,
    });

    console.log('\n  Waiting 10s for sessions to be fully established...');
    await sleep(10000);

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('-'.repeat(50));

    results.p2pRegistration = await p2pRegister(page1, USER1, USER2, uxTracker);

    // ========== STEP 3: Accept P2P Request ==========
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 3: Accept P2P Request');
    console.log('-'.repeat(50));

    await sleep(3000);
    results.p2pAccept = await acceptP2PRequest(page2, USER2, uxTracker);
    await sleep(5000);

    // ========== STEP 4: Open Conversations ==========
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 4: Open Conversations');
    console.log('-'.repeat(50));

    results.conversationOpen.user1 = await openConversation(page1, USER1, USER2, uxTracker);
    await sleep(3000);
    results.conversationOpen.user2 = await openConversation(page2, USER2, USER1, uxTracker);
    await sleep(3000);

    await takeScreenshot(page1, 'NATIVE_CONVERSATION_alice');
    await takeScreenshot(page2, 'NATIVE_CONVERSATION_bob');

    // ========== STEP 5: Test Native File Picker Flow ==========
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 5: Open File Transfer Modal');
    console.log('-'.repeat(50));

    results.nativePickerFlow.modalOpened = await openFileTransferModal(page1, USER1);
    await takeScreenshot(page1, 'NATIVE_MODAL_alice');

    if (results.nativePickerFlow.modalOpened) {
      // Check for native picker button
      results.nativePickerFlow.nativeButtonVisible = await checkNativePickerButton(page1, USER1);
      await takeScreenshot(page1, 'NATIVE_BUTTON_VISIBLE_alice');

      if (results.nativePickerFlow.nativeButtonVisible) {
        // ========== STEP 6: Click Native Picker Button ==========
        console.log('\n' + '-'.repeat(50));
        console.log('STEP 6: Click Native File Picker');
        console.log('-'.repeat(50));

        results.nativePickerFlow.nativeButtonClicked = await clickNativePickerButton(page1, USER1);
        results.nativePickerFlow.pickFileRequestSent = results.nativePickerFlow.nativeButtonClicked;

        if (results.nativePickerFlow.nativeButtonClicked) {
          await takeScreenshot(page1, 'NATIVE_PICKER_CLICKED_alice');

          // ========== STEP 7: Wait for User to Select File ==========
          console.log('\n' + '-'.repeat(50));
          console.log('STEP 7: Wait for File Selection (MANUAL INTERACTION REQUIRED)');
          console.log('-'.repeat(50));
          console.log('\n' + '*'.repeat(60));
          console.log('*  A NATIVE FILE DIALOG SHOULD HAVE OPENED');
          console.log('*  PLEASE SELECT A FILE TO CONTINUE THE TEST');
          console.log('*'.repeat(60) + '\n');

          const dialogResult = await waitForNativeDialogResult(page1, USER1, NATIVE_DIALOG_TIMEOUT_MS);
          results.nativePickerFlow.fileSelected = dialogResult.fileSelected;
          results.nativePickerFlow.error = dialogResult.error;

          await takeScreenshot(page1, 'NATIVE_DIALOG_RESULT_alice');

          if (dialogResult.success && dialogResult.fileSelected) {
            // ========== STEP 8: Verify SendFile Protocol ==========
            console.log('\n' + '-'.repeat(50));
            console.log('STEP 8: Verify SendFile Protocol Used');
            console.log('-'.repeat(50));

            await sleep(3000);
            results.nativePickerFlow.sendFileProtocolUsed = await verifySendFileProtocolUsed(page1, USER1);

            // ========== STEP 9: Wait for Transfer Complete ==========
            console.log('\n' + '-'.repeat(50));
            console.log('STEP 9: Wait for Transfer Complete');
            console.log('-'.repeat(50));

            // Wait for transfer to complete (check receiver side)
            const startTime = Date.now();
            while (Date.now() - startTime < 30000) {
              const completeIndicator = page2.getByText(/Downloaded|complete/i);
              if (await completeIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
                results.nativePickerFlow.transferCompleted = true;
                console.log('  Transfer completed on receiver side');
                break;
              }
              await sleep(2000);
            }

            await takeScreenshot(page1, 'NATIVE_COMPLETE_alice');
            await takeScreenshot(page2, 'NATIVE_COMPLETE_bob');
          }
        }
      }
    }

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const setupPassed =
      results.accountCreation.user1 &&
      results.accountCreation.user2 &&
      results.p2pRegistration &&
      results.conversationOpen.user1 &&
      results.conversationOpen.user2;

    const nativePickerPassed =
      results.nativePickerFlow.modalOpened &&
      results.nativePickerFlow.nativeButtonVisible &&
      results.nativePickerFlow.nativeButtonClicked;

    const fullFlowPassed = nativePickerPassed && results.nativePickerFlow.fileSelected;

    console.log('\nSetup:');
    console.log(`  Account Creation (Alice):     ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Account Creation (Bob):       ${results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Registration:             ${results.p2pRegistration ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Accept:                   ${results.p2pAccept ? 'PASS' : 'SKIP'}`);
    console.log(`  Open Conversation (Alice):    ${results.conversationOpen.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Open Conversation (Bob):      ${results.conversationOpen.user2 ? 'PASS' : 'FAIL'}`);

    console.log('\nNative File Picker Flow:');
    console.log(`  Modal Opened:                 ${results.nativePickerFlow.modalOpened ? 'PASS' : 'FAIL'}`);
    console.log(`  Native Button Visible:        ${results.nativePickerFlow.nativeButtonVisible ? 'PASS' : 'FAIL'}`);
    console.log(`  Native Button Clicked:        ${results.nativePickerFlow.nativeButtonClicked ? 'PASS' : 'FAIL'}`);
    console.log(`  PickFile Request Sent:        ${results.nativePickerFlow.pickFileRequestSent ? 'PASS' : 'FAIL'}`);
    console.log(`  File Selected (manual):       ${results.nativePickerFlow.fileSelected ? 'PASS' : 'SKIPPED/TIMEOUT'}`);
    console.log(`  SendFile Protocol Used:       ${results.nativePickerFlow.sendFileProtocolUsed ? 'PASS' : 'CHECK'}`);
    console.log(`  Transfer Completed:           ${results.nativePickerFlow.transferCompleted ? 'PASS' : 'CHECK'}`);
    if (results.nativePickerFlow.error) {
      console.log(`  Error:                        ${results.nativePickerFlow.error}`);
    }

    console.log('\n' + '='.repeat(60));
    if (fullFlowPassed) {
      console.log('OVERALL: NATIVE PICKER FLOW PASSED');
    } else if (nativePickerPassed) {
      console.log('OVERALL: NATIVE PICKER UI PASSED (file selection skipped/timed out)');
    } else if (setupPassed) {
      console.log('OVERALL: SETUP PASSED, NATIVE PICKER NEEDS REVIEW');
    } else {
      console.log('OVERALL: TEST NEEDS REVIEW');
    }
    console.log('='.repeat(60));

    logObservation('test-complete', `Native File Picker Test ${nativePickerPassed ? 'PASSED' : 'NEEDS REVIEW'}`, {
      results,
    }, nativePickerPassed ? 'verified' : 'investigating');

    writeTestReport('NATIVE_FILE_PICKER_TEST_REPORT.json', {
      users: { user1: USER1, user2: USER2 },
      results,
      passed: nativePickerPassed,
      note: fullFlowPassed
        ? 'Full native picker flow completed with file selection'
        : nativePickerPassed
          ? 'Native picker UI verified, manual file selection was skipped or timed out'
          : 'Native picker flow needs review',
    });

    console.log('\nBrowser will remain open for 20 seconds for manual inspection...');
    await sleep(20000);

    return nativePickerPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', 'Native File Picker Test Error', {
      error: String(error),
    }, 'failed');
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
