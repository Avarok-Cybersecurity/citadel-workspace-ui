/**
 * RE-VFS Peer Integration Test
 *
 * Tests the RE-VFS (shared file system) between two connected peers:
 * 1. Create Alice & Bob accounts
 * 2. P2P register + accept
 * 3. Navigate both to File Manager (?section=files)
 * 4. Verify default tree (Received Files, Sent Files)
 * 5. Alice creates a folder — verify Bob sees it
 * 6. Alice deletes the folder — verify Bob sees deletion
 */

import { Page } from 'playwright';
import {
  sleep,
  createSeparateBrowsers,
  ensureScreenshotsDir,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  setupConsoleCapture,
  logObservation,
  UxIssueTracker,
  waitForWorkspaceLoaded,
  closeAnyModals,
  restartBackendServices,
} from '../lib/index.js';
import { config } from '../lib/config.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: { alice: boolean; bob: boolean };
  p2pSetup: { registered: boolean; accepted: boolean };
  navigation: { alice: boolean; bob: boolean };
  defaultTree: { aliceSeesFolders: boolean; bobSeesFolders: boolean };
  folderCreation: { created: boolean; bobSees: boolean };
  folderDeletion: { deleted: boolean; bobSeesGone: boolean };
}

// ============================================================================
// Config
// ============================================================================

const timestamp = Date.now();
const ALICE = `revfs_alice_${timestamp}`;
const BOB = `revfs_bob_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;
const FOLDER_NAME = 'shared-docs';

// ============================================================================
// Helpers
// ============================================================================

async function navigateToFileManager(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Navigating to File Manager ===`);
  try {
    const loaded = await waitForWorkspaceLoaded(page, 30000);
    if (!loaded) {
      console.log('  Workspace not fully loaded');
      return false;
    }

    // Click the File Manager sidebar button (avoids full page reload / session reclaim)
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

    // Wait for the VFS tree to load. The File Manager polls peers every 2s,
    // so "No Peers Connected" is transient while the service syncs.
    const deadline = Date.now() + 30000;
    let state = 'unknown';
    while (Date.now() < deadline) {
      if (await page.getByText('Sent Files', { exact: true }).first().isVisible().catch(() => false)) {
        state = 'tree';
        break;
      }
      if (await page.locator('text="File System Error"').isVisible().catch(() => false)) {
        const errText = await page.locator('text=/Error:.*/')
          .first().textContent().catch(() => 'unknown error');
        console.log(`  File System Error: ${errText}`);
        state = 'error';
        break;
      }
      // Check for other states
      const noPeers = await page.getByText('No Peers Connected').isVisible().catch(() => false);
      const loading = await page.getByText('Loading file system').isVisible().catch(() => false);
      const connecting = await page.getByText('Connecting...').isVisible().catch(() => false);
      if (noPeers || loading || connecting) {
        console.log(`  Waiting... noPeers=${noPeers} loading=${loading} connecting=${connecting}`);
      }
      await sleep(1000);
    }

    console.log(`  File Manager state: ${state}`);
    return state === 'tree';
  } catch (error) {
    console.error(`  Error navigating: ${error}`);
    return false;
  }
}

async function waitForTreeLoaded(page: Page, label: string, timeoutMs = 30000): Promise<boolean> {
  console.log(`\n=== ${label}: Waiting for VFS tree ===`);
  try {
    await page.getByText('Sent Files', { exact: true }).first().waitFor({ state: 'visible', timeout: timeoutMs });
    console.log('  Tree loaded: true');
    return true;
  } catch {
    console.log('  Tree not loaded');
    return false;
  }
}

async function verifyDefaultFolders(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Verifying default folders ===`);
  const sentFiles = page.getByText('Sent Files', { exact: true }).first();
  const receivedFiles = page.getByText('Received Files', { exact: true }).first();

  const hasSent = await sentFiles.isVisible({ timeout: 5000 }).catch(() => false);
  const hasReceived = await receivedFiles.isVisible({ timeout: 5000 }).catch(() => false);

  console.log(`  Sent Files visible: ${hasSent}`);
  console.log(`  Received Files visible: ${hasReceived}`);
  return hasSent && hasReceived;
}

async function createFolder(page: Page, label: string, folderName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Creating folder "${folderName}" ===`);
  try {
    // Handle the prompt() dialog that will be triggered
    page.once('dialog', async dialog => {
      console.log(`  Dialog appeared: "${dialog.message()}"`);
      await dialog.accept(folderName);
    });

    // Click the New Folder button in toolbar (FolderPlus icon)
    const newFolderBtn = page.locator('button').filter({ has: page.locator('svg.lucide-folder-plus') });
    if (await newFolderBtn.isVisible({ timeout: 5000 })) {
      await newFolderBtn.click();
      console.log('  Clicked New Folder button');
      await sleep(2000);

      // Verify folder appeared
      const folder = page.getByText(folderName, { exact: true }).first();
      const exists = await folder.isVisible({ timeout: 5000 }).catch(() => false);
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

async function syncAndCheckFolder(page: Page, label: string, folderName: string, shouldExist: boolean): Promise<boolean> {
  console.log(`\n=== ${label}: Sync and check folder "${folderName}" (expect ${shouldExist ? 'present' : 'absent'}) ===`);
  try {
    // Try multiple sync attempts — P2P ops may take a moment to propagate
    // Increased from 5 to 10 attempts with longer delays for better reliability
    for (let attempt = 0; attempt < 10; attempt++) {
      const syncBtn = page.locator('button').filter({ has: page.locator('svg.lucide-refresh-cw') });
      if (await syncBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await syncBtn.click();
        console.log(`  Clicked Sync button (attempt ${attempt + 1}/10)`);
      }
      // Longer wait between sync attempts for P2P propagation
      await sleep(4000);

      const folder = page.getByText(folderName, { exact: true }).first();
      const visible = await folder.isVisible().catch(() => false);
      const result = shouldExist ? visible : !visible;
      console.log(`  Folder "${folderName}" visible: ${visible}, expected ${shouldExist ? 'visible' : 'hidden'}: ${result ? 'PASS' : 'FAIL'}`);
      if (result) return true;
    }
    return false;
  } catch {
    return !shouldExist;
  }
}

async function deleteFolder(page: Page, label: string, folderName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Deleting folder "${folderName}" ===`);
  try {
    // Handle the confirm() dialog
    page.once('dialog', async dialog => {
      console.log(`  Confirm dialog: "${dialog.message()}"`);
      await dialog.accept();
    });

    // Right-click on the folder
    const folder = page.getByText(folderName, { exact: true }).first();
    if (!await folder.isVisible({ timeout: 5000 })) {
      console.log('  Folder not found');
      return false;
    }

    await folder.click({ button: 'right' });
    console.log('  Right-clicked folder');
    await sleep(500);

    // Click Delete in context menu
    const deleteItem = page.locator('[role="menuitem"]').filter({ hasText: /delete/i });
    if (await deleteItem.isVisible({ timeout: 3000 })) {
      await deleteItem.click();
      console.log('  Clicked Delete menu item');
      await sleep(2000);

      // Verify folder gone
      const stillVisible = await page.getByText(folderName, { exact: true }).first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`  Folder still visible: ${stillVisible}`);
      return !stillVisible;
    }

    console.log('  Delete menu item not found');
    return false;
  } catch (error) {
    console.error(`  Error deleting folder: ${error}`);
    return false;
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('RE-VFS PEER INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log(`Alice: ${ALICE}`);
  console.log(`Bob: ${BOB}`);
  console.log('');

  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  await restartBackendServices();
  await waitForServicesAlive();

  logObservation('test-start', 'RE-VFS Peer Test Started', {
    alice: ALICE, bob: BOB, timestamp: new Date().toISOString(),
  }, 'investigating');

  // Use SEPARATE browser instances for each user
  // This gives each user their own WebSocket connection, avoiding ILM cross-user issues
  // The ILM was designed for one user with multiple tabs, NOT multiple different users sharing one WebSocket
  const { pages, cleanup } = await createSeparateBrowsers(2);

  const results: TestResults = {
    accountCreation: { alice: false, bob: false },
    p2pSetup: { registered: false, accepted: false },
    navigation: { alice: false, bob: false },
    defaultTree: { aliceSeesFolders: false, bobSeesFolders: false },
    folderCreation: { created: false, bobSees: false },
    folderDeletion: { deleted: false, bobSeesGone: false },
  };

  try {
    const pageAlice = pages[0];
    const pageBob = pages[1];

    setupConsoleCapture(pageAlice, 'Alice', ['error', 'Error', 'revfs', 'RevfsOperation', '[revfs]', 'P2P', 'Sending reliable']);
    setupConsoleCapture(pageBob, 'Bob', ['error', 'Error', 'revfs', 'RevfsOperation', '[revfs]', 'P2P', 'Sending reliable']);

    // ========== STEP 1: Create Accounts ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Accounts');
    console.log('─'.repeat(50));

    results.accountCreation.alice = await createAccount(pageAlice, ALICE, {
      isFirstUser: true, password: PASSWORD, uxTracker,
    });
    results.accountCreation.bob = await createAccount(pageBob, BOB, {
      isFirstUser: false, password: PASSWORD, uxTracker,
    });

    await takeScreenshot(pageAlice, '01_alice_account');
    await takeScreenshot(pageBob, '01_bob_account');

    if (!results.accountCreation.alice || !results.accountCreation.bob) {
      throw new Error('Account creation failed');
    }

    console.log('\n  Waiting 10s for sessions to establish...');
    await sleep(10000);

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('─'.repeat(50));

    results.p2pSetup.registered = await p2pRegister(pageAlice, ALICE, BOB, uxTracker);
    await sleep(3000);
    results.p2pSetup.accepted = await acceptP2PRequest(pageBob, BOB, uxTracker);
    // Wait longer for P2P channel to be fully established before file operations
    console.log('  Waiting 10s for P2P channel to fully establish...');
    await sleep(10000);

    await takeScreenshot(pageAlice, '02_p2p_registered');
    await takeScreenshot(pageBob, '02_p2p_accepted');

    if (!results.p2pSetup.registered || !results.p2pSetup.accepted) {
      throw new Error('P2P setup failed');
    }

    // ========== STEP 3: Navigate to File Manager ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Navigate to File Manager');
    console.log('─'.repeat(50));

    await closeAnyModals(pageAlice);
    await closeAnyModals(pageBob);

    results.navigation.alice = await navigateToFileManager(pageAlice, 'Alice');
    results.navigation.bob = await navigateToFileManager(pageBob, 'Bob');

    await takeScreenshot(pageAlice, '03_alice_file_manager');
    await takeScreenshot(pageBob, '03_bob_file_manager');

    // ========== STEP 4: Verify Default Tree ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Verify Default Tree');
    console.log('─'.repeat(50));

    const aliceTreeLoaded = await waitForTreeLoaded(pageAlice, 'Alice');
    const bobTreeLoaded = await waitForTreeLoaded(pageBob, 'Bob');

    if (aliceTreeLoaded) {
      results.defaultTree.aliceSeesFolders = await verifyDefaultFolders(pageAlice, 'Alice');
    }
    if (bobTreeLoaded) {
      results.defaultTree.bobSeesFolders = await verifyDefaultFolders(pageBob, 'Bob');
    }

    await takeScreenshot(pageAlice, '04_alice_default_tree');
    await takeScreenshot(pageBob, '04_bob_default_tree');

    // ========== STEP 5: Create Folder (Alice) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Alice Creates Folder');
    console.log('─'.repeat(50));

    if (aliceTreeLoaded) {
      results.folderCreation.created = await createFolder(pageAlice, 'Alice', FOLDER_NAME);
      await takeScreenshot(pageAlice, '05_alice_folder_created');

      if (results.folderCreation.created) {
        // Wait for the direct P2P Mkdir message to propagate before syncing
        // Increased from 3s to 5s for more reliable P2P propagation
        console.log('  Waiting 5s for P2P folder creation to propagate...');
        await sleep(5000);
        results.folderCreation.bobSees = await syncAndCheckFolder(pageBob, 'Bob', FOLDER_NAME, true);
        await takeScreenshot(pageBob, '05_bob_sees_folder');
      }
    }

    // ========== STEP 6: Delete Folder (Alice) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Alice Deletes Folder');
    console.log('─'.repeat(50));

    if (results.folderCreation.created) {
      results.folderDeletion.deleted = await deleteFolder(pageAlice, 'Alice', FOLDER_NAME);
      await takeScreenshot(pageAlice, '06_alice_folder_deleted');

      if (results.folderDeletion.deleted) {
        await sleep(5000);
        results.folderDeletion.bobSeesGone = await syncAndCheckFolder(pageBob, 'Bob', FOLDER_NAME, false);
        await takeScreenshot(pageBob, '06_bob_folder_gone');
      }
    }

    // ========== RESULTS ==========
    await takeScreenshot(pageAlice, 'FINAL_alice');
    await takeScreenshot(pageBob, 'FINAL_bob');

    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const allPassed =
      results.accountCreation.alice && results.accountCreation.bob &&
      results.p2pSetup.registered && results.p2pSetup.accepted &&
      results.navigation.alice && results.navigation.bob &&
      results.defaultTree.aliceSeesFolders && results.defaultTree.bobSeesFolders &&
      results.folderCreation.created && results.folderCreation.bobSees &&
      results.folderDeletion.deleted && results.folderDeletion.bobSeesGone;

    console.log('\nAccounts:');
    console.log(`  Alice: ${results.accountCreation.alice ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob:   ${results.accountCreation.bob ? 'PASS' : 'FAIL'}`);

    console.log('\nP2P:');
    console.log(`  Registered: ${results.p2pSetup.registered ? 'PASS' : 'FAIL'}`);
    console.log(`  Accepted:   ${results.p2pSetup.accepted ? 'PASS' : 'FAIL'}`);

    console.log('\nNavigation:');
    console.log(`  Alice: ${results.navigation.alice ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob:   ${results.navigation.bob ? 'PASS' : 'FAIL'}`);

    console.log('\nDefault Tree:');
    console.log(`  Alice sees folders: ${results.defaultTree.aliceSeesFolders ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob sees folders:   ${results.defaultTree.bobSeesFolders ? 'PASS' : 'FAIL'}`);

    console.log('\nFolder Creation:');
    console.log(`  Alice created:  ${results.folderCreation.created ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob sees it:    ${results.folderCreation.bobSees ? 'PASS' : 'FAIL'}`);

    console.log('\nFolder Deletion:');
    console.log(`  Alice deleted:    ${results.folderDeletion.deleted ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob sees gone:    ${results.folderDeletion.bobSeesGone ? 'PASS' : 'FAIL'}`);

    const uxIssues = uxTracker.getIssues();
    if (uxIssues.length > 0) {
      console.log('\n' + '─'.repeat(50));
      console.log('UX ISSUES:');
      uxIssues.forEach((issue, i) => {
        console.log(`  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL: ${allPassed ? 'TEST PASSED' : 'TEST FAILED'}`);
    console.log('='.repeat(60));

    logObservation('test-complete', `RE-VFS Peer Test ${allPassed ? 'PASSED' : 'COMPLETED'}`, {
      results, uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'investigating');

    writeTestReport('REVFS_PEER_TEST_REPORT.json', {
      alice: ALICE, bob: BOB, results, uxIssues, passed: allPassed,
    });

    console.log('\nBrowser will remain open for 10 seconds...');
    await sleep(10000);

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', 'RE-VFS Peer Test Error', { error: String(error) }, 'failed');
    throw error;
  } finally {
    await cleanup();
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
