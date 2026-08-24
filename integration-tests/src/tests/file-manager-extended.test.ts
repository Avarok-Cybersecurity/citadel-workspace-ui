/**
 * File Manager Extended Integration Test (P8)
 *
 * Tests file manager edge cases and additional UI elements:
 * 1. Sort controls
 * 2. VFSPropertiesDialog ("Info" in the item context menu)
 * 3. StorageLimitModal / RevfsDisabledModal (component rendering)
 *
 * Two things this file used to claim to test are gone, because the app has
 * no such UI (both verified against citadel-workspaces/src):
 *   - a grid/list view toggle. FileManagerContent renders VFSTreeView plus
 *     VFSContentGrid unconditionally; VFSToolbar has breadcrumbs, filter,
 *     sort, new-folder, upload and sync, and nothing else.
 *   - FileUploadProgress / fileUploadService. Neither the component nor
 *     src/lib/file-upload-service.ts exists, so the dynamic import the test
 *     performed could only ever throw.
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  createIsolatedContexts,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  waitForAppReady,
  closeAnyModals,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { config } from '../lib/config.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: { user1: boolean; user2: boolean };
  p2pRegistered: boolean;
  fileManagerLoaded: boolean;

  // Sort controls
  sortControlVisible: boolean;
  sortChangeWorks: boolean;

  // Properties dialog
  /** Needs a completed file transfer; this spec makes none. */
  propertiesDialogOpens?: boolean;

  // Error state modals (P8 extended)
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `files_ext_a_${timestamp}`;
const USER2 = `files_ext_b_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// The content grid's scroll container. Its "Sent Files" entry also exists in
// the tree sidebar to its left, and the two behave differently (VFSTreeView
// passes a no-op onInfo), so item lookups have to be scoped to the grid.

// ============================================================================
// Helper Functions
// ============================================================================

async function navigateToFileManager(page: Page): Promise<boolean> {
  console.log('\n=== Navigating to File Manager ===');

  // FilesSection ships data-testid="file-manager-button". The old selector
  // union matched the FILES group label and any button containing "files",
  // and its URL fallback went to BASE_URL + '/?section=files' — that is the
  // Landing route, which never renders the file manager (Office is /workspace).
  const filesBtn = page.locator('[data-testid="file-manager-button"]');
  if (await isVisibleWithin(filesBtn, 10000)) {
    await filesBtn.click();
  } else {
    const baseUrl = page.url().split('?')[0];
    await page.goto(`${baseUrl}?section=files`, { waitUntil: 'commit', timeout: 30000 });
    await waitForAppReady(page, 30000);
  }

  // The file manager opens in P2P storage mode and shows NoPeersScreen when no
  // peer tree is available. Server storage needs only the C2S session, so take
  // that door whenever it is offered: it keeps the rest of this spec off the
  // P2P handshake's critical path.
  const useServerBtn = page.getByRole('button', { name: 'Use Server Storage' });
  if (await isVisibleWithin(useServerBtn, 5000)) {
    console.log('  No peers connected - switching to Server Storage');
    await useServerBtn.click();
  }

  // Every freshly seeded RE-VFS tree contains the protected "Sent Files" and
  // "Received Files" directories, so this is proof the VFS browser itself
  // rendered. The old check — getByText(/File Manager|Files|Sent Files|.../) —
  // also matched the sidebar's own "File Manager" button and the "FILES" group
  // label, so it reported loaded even when the pane showed an error screen.
  const sentFiles = page.getByText('Sent Files', { exact: true }).first();
  const loaded = await isVisibleWithin(sentFiles, 30000);
  console.log(`  File manager loaded: ${loaded}`);
  return loaded;
}

async function testSortControls(page: Page): Promise<{
  visible: boolean;
  changeWorks: boolean;
}> {
  console.log('\n=== Testing Sort Controls ===');

  const results = { visible: false, changeWorks: false };

  // VFSToolbar's sort control is a Radix dropdown trigger whose label is the
  // current sort field ("Name" by default). There is no "Sort" text, no
  // aria-label and no <select>, which is why every branch of the old lookup
  // failed. aria-haspopup="menu" is what Radix puts on the trigger.
  //
  // The label is matched with an anchored regex, not a bare string: hasText
  // with a string is a case-insensitive *substring* match, so 'Name' would also
  // match any other menu trigger whose text contains "username".
  const sortTrigger = (label: RegExp) =>
    page.locator('button[aria-haspopup="menu"]').filter({ hasText: label }).first();

  results.visible = await isVisibleWithin(sortTrigger(/^Name$/), 10000);
  console.log(`  Sort control visible: ${results.visible}`);
  if (!results.visible) return results;

  await sortTrigger(/^Name$/).click();

  const dateItem = page.getByRole('menuitem', { name: 'Date Modified' });
  if (!(await isVisibleWithin(dateItem, 5000))) {
    console.log('  Sort menu did not open');
    return results;
  }
  await dateItem.click();

  // The old assertion stopped at "a menu item appeared", which says nothing
  // about sorting. Choosing a field re-labels the trigger, so waiting for the
  // new label is the app confirming the sort state actually changed.
  results.changeWorks = await isVisibleWithin(sortTrigger(/^Date Modified$/), 5000);
  console.log(`  Sort change works: ${results.changeWorks}`);

  return results;
}

/**
 * The Info dialog needs a FILE, and this spec never creates one.
 *
 * VFSContextMenu renders its Info entry inside `{!isDir && ...}`, so directories
 * — including the seeded, protected "Sent Files" — never offer it. The spec
 * right-clicked that directory and reported a failure when no Info item
 * appeared, which is the menu behaving exactly as written.
 *
 * Reaching it for real needs a completed file transfer, the same precondition
 * File Preview is skipped for. Left as a stated skip rather than made to pass
 * against a directory that will never show the entry.
 */
async function testPropertiesDialog(): Promise<undefined> {
  console.log('\n=== Properties Dialog: SKIP ===');
  console.log('  The Info entry renders only for files (VFSContextMenu, !isDir),');
  console.log('  and this spec transfers none.');
  return undefined;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'File Manager Extended Test',
    reportFileName: 'FILE_MANAGER_EXTENDED_TEST_REPORT.json',
    metadata: { user1: USER1, user2: USER2 },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  const { browser } = await createBrowser();
  const [context1, context2] = await createIsolatedContexts(browser, 2);

  const results: TestResults = {
    accountCreation: { user1: false, user2: false },
    p2pRegistered: false,
    fileManagerLoaded: false,
    sortControlVisible: false,
    sortChangeWorks: false,
  };

  try {
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    setupConsoleCapture(page1, 'User1', ['error', 'Error']);
    setupConsoleCapture(page2, 'User2', ['error', 'Error']);

    // ========== STEP 1: Create Accounts & P2P ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Accounts & P2P Register');
    console.log('─'.repeat(50));

    results.accountCreation.user1 = await createAccount(page1, USER1, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });
    results.accountCreation.user2 = await createAccount(page2, USER2, {
      isFirstUser: false,
      password: PASSWORD,
      uxTracker,
    });

    if (!results.accountCreation.user1) throw new Error('User1 creation failed');

    // P2P registration lets the file manager open in peer-storage mode. It is
    // best-effort: navigateToFileManager falls back to server storage, so the
    // rest of the spec does not depend on the handshake landing.
    results.p2pRegistered = await p2pRegister(page1, USER1, USER2);
    await sleep(3000);
    await acceptP2PRequest(page2, USER2);
    await sleep(5000);

    await closeAnyModals(page1);
    await waitForWorkspaceLoaded(page1, 30000);

    // ========== STEP 2: Navigate to File Manager ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Navigate to File Manager');
    console.log('─'.repeat(50));

    results.fileManagerLoaded = await navigateToFileManager(page1);
    await takeScreenshot(page1, '02_file_manager');

    // ========== STEP 3: Test Sort Controls ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Test Sort Controls');
    console.log('─'.repeat(50));

    if (results.fileManagerLoaded) {
      const sortResult = await testSortControls(page1);
      results.sortControlVisible = sortResult.visible;
      results.sortChangeWorks = sortResult.changeWorks;
      await takeScreenshot(page1, '03_sort_controls');
    }

    // ========== STEP 4: Test Properties Dialog ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Test Properties Dialog');
    console.log('─'.repeat(50));

    if (results.fileManagerLoaded) {
      results.propertiesDialogOpens = await testPropertiesDialog();
      await takeScreenshot(page1, '04_properties');
    }

    // ========== STEP 5: File Preview (skipped) ==========
    // FilePreviewDialog is the sidebar FILES section's dialog and it only opens
    // for a *completed incoming* file transfer (FilesSection filters
    // fileTransferService transfers on state === 'complete' && isIncoming).
    // This spec never performs a transfer, so the precondition does not exist —
    // the old version clicked a VFS grid item instead, which downloads a remote
    // file and opens no dialog at all. Covering this belongs in a spec that
    // actually sends a file (see file-transfer.test.ts).

    // STEP 6 and STEP 7 removed: they tested nothing about this product.
    //
    // Both located Vite's dev-server React URLs in performance entries,
    // dynamically imported StorageLimitModal / RevfsDisabledModal, and rendered
    // them into a detached root. That asserts a component can be imported and
    // mounted in isolation — not that the app ever shows it — and it only works
    // against a dev server, so it could never run on a production build.
    //
    // Both modals are state-dependent (storage limit reached; revfs disabled)
    // and this spec cannot produce either state. Reaching them for real needs a
    // fixture that can, which does not exist yet. Better absent than green.
    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    // Everything gated here is single-user and deterministic: account creation,
    // in-app navigation, and client-side rendering. p2pRegistered is the one
    // exception — it is a two-party handshake, and the file manager falls back
    // to server storage without it, so it is reported but not gated.
    const corePassed =
      results.accountCreation.user1 &&
      results.accountCreation.user2 &&
      results.fileManagerLoaded &&
      results.sortControlVisible &&
      results.sortChangeWorks;

    console.log(`\n  User1 Created:             ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  User2 Created:             ${results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Registered:            ${results.p2pRegistered ? 'PASS' : 'CHECK'}  (not gated: P2P handshake timing)`);
    console.log(`  File Manager Loaded:       ${results.fileManagerLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`  Sort Control:              ${results.sortControlVisible ? 'PASS' : 'FAIL'}`);
    console.log(`  Sort Change:               ${results.sortChangeWorks ? 'PASS' : 'FAIL'}`);
    console.log(`  Properties Dialog:         ${results.propertiesDialogOpens === undefined ? 'SKIP (Info renders only for files; this spec transfers none)' : results.propertiesDialogOpens ? 'PASS' : 'FAIL'}`);
    console.log('  File Preview:              SKIP (needs a completed incoming transfer; this spec sends no files)');

    harness.finalize(corePassed, results);
    return corePassed;

  } catch (error) {
    console.error('\nTest error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

runTestMain(runTest);
