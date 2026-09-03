/**
 * RE-VFS Server Integration Test
 *
 * Tests the RE-VFS server storage functionality (client-to-server):
 * 1. Create a single user account
 * 2. Navigate to File Manager
 * 3. Switch to Server Storage mode
 * 4. Verify default tree (Received Files, Sent Files)
 * 5. Create folder in server storage
 * 6. Verify folder exists
 * 7. Delete folder
 * 8. Verify folder is gone
 *
 * Unlike P2P RE-VFS, server storage:
 * - Requires only one user (no P2P registration)
 * - Stores encrypted files on the Citadel server
 * - Has no peer sync (local tree + server backend)
 */

import { Page } from 'playwright';
import {
  sleep,
  createSeparateBrowsers,
  createAccount,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  closeAnyModals,
  TestHarness,
  runTestMain,
  isHiddenWithin,
} from '../lib/index.js';
import { config } from '../lib/config.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: boolean;
  navigation: boolean;
  switchToServerMode: boolean;
  defaultTree: boolean;
  folderCreation: boolean;
  folderDeletion: boolean;
  deletionPersisted: boolean;
  fileUpload: boolean;
  fileVisible: boolean;
  fileDeletion: boolean;
}

// ============================================================================
// Config
// ============================================================================

const timestamp = Date.now();
const USERNAME = `revfs_server_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;
const FOLDER_NAME = 'server-docs';

// ============================================================================
// Helpers
// ============================================================================

async function navigateToFileManager(page: Page): Promise<boolean> {
  console.log('\n=== Navigating to File Manager ===');
  try {
    const loaded = await waitForWorkspaceLoaded(page, 30000);
    if (!loaded) {
      console.log('  Workspace not fully loaded');
      return false;
    }

    // Click the File Manager sidebar button
    const filesBtn = page.locator('[data-testid="file-manager-button"]');
    if (await filesBtn.isVisible().catch(() => false)) {
      await filesBtn.click();
      console.log('  Clicked File Manager sidebar button');
    } else {
      // Fallback: navigate via URL
      const currentUrl = page.url();
      const baseUrl = currentUrl.split('?')[0];
      await page.goto(`${baseUrl}?section=files`, { waitUntil: 'commit', timeout: 30000 });
      console.log('  Navigated via URL (fallback)');
    }
    await sleep(2000);
    console.log('  Navigation complete');
    return true;
  } catch (error) {
    console.error(`  Error navigating: ${error}`);
    return false;
  }
}

async function switchToServerStorageMode(page: Page): Promise<boolean> {
  console.log('\n=== Switching to Server Storage Mode ===');
  try {
    // Look for "Server Storage" button in the storage mode selector
    const serverStorageBtn = page.getByRole('button', { name: /server storage/i });

    // First check if already in server mode (button should be highlighted)
    const isAlreadyServer = await serverStorageBtn.evaluate(el => {
      return el.classList.contains('bg-purple-700');
    }).catch(() => false);

    if (isAlreadyServer) {
      console.log('  Already in Server Storage mode');
      return true;
    }

    // Click the Server Storage button
    if (await isVisibleWithin(serverStorageBtn, 5000)) {
      await serverStorageBtn.click();
      console.log('  Clicked Server Storage button');
      await sleep(1000);

      // Verify the mode changed (button should now be highlighted)
      const isNowServer = await serverStorageBtn.evaluate(el => {
        return el.classList.contains('bg-purple-700');
      }).catch(() => false);

      console.log(`  Server Storage mode active: ${isNowServer}`);
      return isNowServer;
    }

    // Alternative: try clicking by text if role selector doesn't work
    const altBtn = page.locator('button').filter({ hasText: 'Server Storage' });
    if (await isVisibleWithin(altBtn, 3000)) {
      await altBtn.click();
      console.log('  Clicked Server Storage button (alt selector)');
      await sleep(1000);
      return true;
    }

    console.log('  Server Storage button not found');
    return false;
  } catch (error) {
    console.error(`  Error switching mode: ${error}`);
    return false;
  }
}

async function waitForTreeLoaded(page: Page, timeoutMs = 30000): Promise<boolean> {
  console.log('\n=== Waiting for VFS tree ===');
  try {
    await page.getByText('Sent Files', { exact: true }).first().waitFor({ state: 'visible', timeout: timeoutMs });
    console.log('  Tree loaded: true');
    return true;
  } catch {
    console.log('  Tree not loaded');
    return false;
  }
}

async function verifyDefaultFolders(page: Page): Promise<boolean> {
  console.log('\n=== Verifying default folders ===');
  const sentFiles = page.getByText('Sent Files', { exact: true }).first();
  const receivedFiles = page.getByText('Received Files', { exact: true }).first();

  const hasSent = await isVisibleWithin(sentFiles, 5000);
  const hasReceived = await isVisibleWithin(receivedFiles, 5000);

  console.log(`  Sent Files visible: ${hasSent}`);
  console.log(`  Received Files visible: ${hasReceived}`);
  return hasSent && hasReceived;
}

async function createFolder(page: Page, folderName: string): Promise<boolean> {
  console.log(`\n=== Creating folder "${folderName}" ===`);
  try {
    // The name is asked for by an in-app dialog now, not window.prompt, so
    // there is no native dialog to accept — type into the field and submit.
    const newFolderBtn = page.locator('button').filter({ has: page.locator('svg.lucide-folder-plus') });
    if (await isVisibleWithin(newFolderBtn, 5000)) {
      await newFolderBtn.click();
      console.log('  Clicked New Folder button');

      const nameInput = page.locator('#prompt-dialog-input');
      if (!await isVisibleWithin(nameInput, 5000)) {
        console.log('  ERROR: the new-folder dialog did not appear');
        return false;
      }
      await nameInput.fill(folderName);
      await page.getByTestId('prompt-dialog-confirm').click();
      await sleep(2000);

      // Verify folder appeared
      const folder = page.getByText(folderName, { exact: true }).first();
      const exists = await isVisibleWithin(folder, 5000);
      console.log(`  Folder "${folderName}" visible: ${exists}`);
      return exists;
    }

    console.log('  New Folder button not found');
    return false;
  } catch (error) {
    console.error(`  Error creating folder: ${error}`);
    return false;
  }
}

async function deleteFolder(page: Page, folderName: string): Promise<boolean> {
  console.log(`\n=== Deleting folder "${folderName}" ===`);
  try {
    // Deletion is confirmed by an in-app AlertDialog now, not window.confirm;
    // the confirm button is clicked after the menu item below.

    // Right-click on the folder
    const folder = page.getByText(folderName, { exact: true }).first();
    if (!await isVisibleWithin(folder, 5000)) {
      console.log('  Folder not found');
      return false;
    }

    await folder.click({ button: 'right' });
    console.log('  Right-clicked folder');
    await sleep(500);

    // Click Delete in context menu
    const deleteItem = page.locator('[role="menuitem"]').filter({ hasText: /delete/i });
    if (await isVisibleWithin(deleteItem, 3000)) {
      await deleteItem.click();
      console.log('  Clicked Delete menu item');

      // Confirm in the app's own dialog.
      const confirmDelete = page.getByTestId('confirm-dialog-confirm');
      if (await isVisibleWithin(confirmDelete, 5000)) {
        await confirmDelete.click();
        console.log('  Confirmed deletion in the in-app dialog');
      } else {
        console.log('  WARNING: in-app confirm dialog did not appear');
      }
      await sleep(2000);

      // Verify folder gone.
      //
      // isHiddenWithin, not isVisible({ timeout }). That option is declared
      // ignored, so this sampled once: a tree that had not re-rendered yet
      // reported the folder absent and deleteFolder returned success whether or
      // not anything was deleted. This value gates results.folderDeletion, so
      // the false positive propagated straight into the run's verdict.
      const gone = await isHiddenWithin(
        page.getByText(folderName, { exact: true }).first(),
        5000
      );
      console.log(`  Folder still visible: ${!gone}`);
      return gone;
    }

    console.log('  Delete menu item not found');
    return false;
  } catch (error) {
    console.error(`  Error deleting folder: ${error}`);
    return false;
  }
}

async function verifyServerStorageIndicator(page: Page): Promise<boolean> {
  console.log('\n=== Verifying Server Storage indicator ===');
  try {
    // Look for the server storage indicator text
    const indicator = page.getByText('Private encrypted storage on Citadel server');
    const visible = await isVisibleWithin(indicator, 5000);
    console.log(`  Server storage indicator visible: ${visible}`);
    return visible;
  } catch {
    return false;
  }
}

async function refreshTree(page: Page): Promise<void> {
  console.log('\n=== Refreshing tree ===');
  const syncBtn = page.locator('button').filter({ has: page.locator('svg.lucide-refresh-cw') });
  if (await isVisibleWithin(syncBtn, 3000)) {
    await syncBtn.click();
    console.log('  Clicked refresh button');
    await sleep(2000);
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'RE-VFS Server Integration Test',
    reportFileName: 'REVFS_SERVER_TEST_REPORT.json',
    metadata: { username: USERNAME },
    restartBackend: true,
  });
  console.log(`User: ${USERNAME}`);
  console.log('');

  const { pages, cleanup } = await createSeparateBrowsers(1);

  const results: TestResults = {
    accountCreation: false,
    navigation: false,
    switchToServerMode: false,
    defaultTree: false,
    folderCreation: false,
    folderDeletion: false,
    deletionPersisted: false,
    fileUpload: false,
    fileVisible: false,
    fileDeletion: false,
  };

  try {
    const page = pages[0];

    setupConsoleCapture(page, 'User', ['error', 'Error', 'revfs', '[revfs]', 'server', 'Server']);

    // ========== STEP 1: Create Account ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('─'.repeat(50));

    results.accountCreation = await createAccount(page, USERNAME, {
      isFirstUser: true, password: PASSWORD, uxTracker: harness.uxTracker,
    });

    await takeScreenshot(page, '01_account_created');

    if (!results.accountCreation) {
      throw new Error('Account creation failed');
    }

    console.log('\n  Waiting 5s for session to establish...');
    await sleep(5000);

    // ========== STEP 2: Navigate to File Manager ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Navigate to File Manager');
    console.log('─'.repeat(50));

    await closeAnyModals(page);
    results.navigation = await navigateToFileManager(page);

    await takeScreenshot(page, '02_file_manager');

    if (!results.navigation) {
      throw new Error('Navigation failed');
    }

    // ========== STEP 3: Switch to Server Storage Mode ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Switch to Server Storage Mode');
    console.log('─'.repeat(50));

    // At this point, we might see "No Peers Connected" - that's expected
    // Click the "Use Server Storage" button or switch via tab
    const noPeersVisible = await page.getByText('No Peers Connected').isVisible().catch(() => false);
    if (noPeersVisible) {
      console.log('  Detected "No Peers Connected" state');
      // Click the "Use Server Storage" button
      const useServerBtn = page.getByRole('button', { name: /use server storage/i });
      if (await isVisibleWithin(useServerBtn, 3000)) {
        await useServerBtn.click();
        console.log('  Clicked "Use Server Storage" button');
        await sleep(2000);
        results.switchToServerMode = true;
      } else {
        results.switchToServerMode = await switchToServerStorageMode(page);
      }
    } else {
      results.switchToServerMode = await switchToServerStorageMode(page);
    }

    await takeScreenshot(page, '03_server_mode');

    // Verify server storage indicator is visible
    const indicatorVisible = await verifyServerStorageIndicator(page);
    console.log(`  Server storage indicator: ${indicatorVisible}`);

    // ========== STEP 4: Verify Default Tree ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Verify Default Tree');
    console.log('─'.repeat(50));

    const treeLoaded = await waitForTreeLoaded(page);
    if (treeLoaded) {
      results.defaultTree = await verifyDefaultFolders(page);
    }

    await takeScreenshot(page, '04_default_tree');

    // ========== STEP 5: Create Folder ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Create Folder');
    console.log('─'.repeat(50));

    if (treeLoaded) {
      results.folderCreation = await createFolder(page, FOLDER_NAME);
      await takeScreenshot(page, '05_folder_created');

      // Refresh to verify persistence
      await refreshTree(page);
      const stillThere = await page.getByText(FOLDER_NAME, { exact: true }).first().isVisible().catch(() => false);
      console.log(`  Folder persisted after refresh: ${stillThere}`);
    }

    // ========== STEP 6: Delete Folder ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Delete Folder');
    console.log('─'.repeat(50));

    if (results.folderCreation) {
      results.folderDeletion = await deleteFolder(page, FOLDER_NAME);
      await takeScreenshot(page, '06_folder_deleted');

      // Refresh to verify deletion persisted
      await refreshTree(page);
      // isHiddenWithin, not isVisible({ timeout }): the latter is an immediate
      // snapshot (Playwright declares that option ignored), so a tree that had
      // simply not re-rendered yet read as "folder gone" and the deletion looked
      // persisted whether or not it was.
      //
      // The result is also RECORDED now. It was previously computed into a local
      // and logged, and nothing consumed it — the line "Folder deletion
      // persisted: false" could print while the test passed, which is the same
      // as not checking that deletion survives a refresh at all.
      results.deletionPersisted = await isHiddenWithin(
        page.getByText(FOLDER_NAME, { exact: true }).first(),
        5000
      );
      console.log(`  Folder deletion persisted: ${results.deletionPersisted}`);
    }

    // ========== RESULTS ==========
    await takeScreenshot(page, 'FINAL');

    const corePassed =
      results.accountCreation &&
      results.navigation &&
      results.switchToServerMode &&
      results.defaultTree &&
      results.folderCreation &&
      results.folderDeletion &&
      results.deletionPersisted;

    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));
    console.log('\nCore Tests:');
    console.log(`  Account Creation:       ${results.accountCreation ? 'PASS' : 'FAIL'}`);
    console.log(`  Navigation:             ${results.navigation ? 'PASS' : 'FAIL'}`);
    console.log(`  Switch to Server Mode:  ${results.switchToServerMode ? 'PASS' : 'FAIL'}`);
    console.log(`  Default Tree:           ${results.defaultTree ? 'PASS' : 'FAIL'}`);
    console.log(`  Folder Creation:        ${results.folderCreation ? 'PASS' : 'FAIL'}`);
    console.log(`  Folder Deletion:        ${results.folderDeletion ? 'PASS' : 'FAIL'}`);
    console.log(`  Deletion Persisted:     ${results.deletionPersisted ? 'PASS' : 'FAIL'}`);

    harness.finalize(corePassed, results);


    return corePassed;

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
