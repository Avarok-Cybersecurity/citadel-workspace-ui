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
import { isVisibleWithin, isHiddenWithin } from '../lib/index.js';

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
  propertiesDialogOpens: boolean;

  // Error state modals (P8 extended)
  storageLimitModalRenders: boolean;
  revfsDisabledModalRenders: boolean;
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
const CONTENT_GRID = 'div[role="button"].flex-1.overflow-y-auto.p-4';

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

async function testPropertiesDialog(page: Page): Promise<boolean> {
  console.log('\n=== Testing Properties Dialog ===');

  // No [role="treeitem"] exists anywhere in the file manager — GridItem and the
  // tree rows are divs with role="button" — so the old locator was matching on
  // the `[class*="folder"]` fallback at best.
  const grid = page.locator(CONTENT_GRID).first();
  const sentFiles = grid.getByRole('button', { name: 'Sent Files' }).first();
  if (!(await isVisibleWithin(sentFiles, 10000))) {
    console.log('  "Sent Files" not present in the content grid');
    return false;
  }

  await sentFiles.click({ button: 'right' });

  // The app labels this entry "Info" (VFSContextMenu), never "Properties".
  const infoItem = page.getByRole('menuitem', { name: 'Info' });
  if (!(await isVisibleWithin(infoItem, 5000))) {
    console.log('  "Info" not found in the item context menu');
    await page.keyboard.press('Escape');
    return false;
  }
  await infoItem.click();

  // VFSPropertiesDialog titles itself with the node name and lists a Location
  // row. Asserting on both beats "some [role=dialog] is on screen", which any
  // other modal would have satisfied.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Sent Files' });
  const opens = await isVisibleWithin(dialog, 5000);
  const hasDetails = opens && (await isVisibleWithin(dialog.getByText('Location:'), 3000));
  console.log(`  Properties dialog opens: ${opens} (details rendered: ${hasDetails})`);

  if (opens) {
    await page.keyboard.press('Escape');
    await isHiddenWithin(dialog, 3000);
  }

  return opens && hasDetails;
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
    propertiesDialogOpens: false,
    storageLimitModalRenders: false,
    revfsDisabledModalRenders: false,
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
      results.propertiesDialogOpens = await testPropertiesDialog(page1);
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

    // ========== STEP 6: Test StorageLimitModal ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Test StorageLimitModal');
    console.log('─'.repeat(50));

    // Render StorageLimitModal directly via ReactDOM.
    // Bare specifiers like import('react') don't work in page.evaluate()
    // because the code doesn't go through Vite's transform pipeline.
    // Discover the Vite-resolved URLs from performance entries instead.
    // NOTE: this depends on the app being served by the Vite dev server (the
    // /src/... path is a dev-server module URL); it will not work against a
    // production build.
    results.storageLimitModalRenders = await page1.evaluate(async () => {
      try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const reactUrl = entries.find(e => /\.vite\/deps\/react\.js/.test(e.name))?.name;
        const reactDomUrl = entries.find(e => /\.vite\/deps\/react-dom_client\.js/.test(e.name))?.name;

        if (!reactUrl || !reactDomUrl) {
          console.error('Cannot find Vite-resolved React paths in performance entries');
          return false;
        }

        const React: any = await import(/* @vite-ignore */ reactUrl);
        const ReactDOM: any = await import(/* @vite-ignore */ reactDomUrl);
        const p = '/src/components/file-manager/' + 'StorageLimitModal.tsx';
        const mod: any = await import(/* @vite-ignore */ p);
        const { StorageLimitModal } = mod;

        const container = document.createElement('div');
        container.id = 'test-storage-limit-modal';
        document.body.appendChild(container);

        const ce = React.default?.createElement || React.createElement;
        const cr = ReactDOM.default?.createRoot || ReactDOM.createRoot;

        const root = cr(container);
        root.render(
          ce(StorageLimitModal, {
            isOpen: true,
            onClose: () => root.unmount(),
            usedBytes: 900_000_000,
            quotaBytes: 1_000_000_000,
            attemptedFileSize: 200_000_000,
          })
        );
        return true;
      } catch (e) {
        console.error('StorageLimitModal render error:', e);
        return false;
      }
    });
    if (results.storageLimitModalRenders) {
      const modal = page1.getByRole('dialog').filter({ hasText: 'Storage Limit Reached' });
      results.storageLimitModalRenders = await isVisibleWithin(modal, 5000);
      console.log(`  StorageLimitModal renders: ${results.storageLimitModalRenders}`);

      // Close it via its own Cancel button, scoped to the modal so a Cancel
      // elsewhere on the page cannot be clicked instead.
      const cancelBtn = modal.getByRole('button', { name: 'Cancel' });
      if (await isVisibleWithin(cancelBtn, 2000)) {
        await cancelBtn.click();
        await isHiddenWithin(modal, 3000);
      }
    } else {
      console.log('  StorageLimitModal: could not render via dynamic import');
    }
    await takeScreenshot(page1, '06_storage_limit_modal');

    // ========== STEP 7: Test RevfsDisabledModal ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Test RevfsDisabledModal');
    console.log('─'.repeat(50));

    results.revfsDisabledModalRenders = await page1.evaluate(async () => {
      try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const reactUrl = entries.find(e => /\.vite\/deps\/react\.js/.test(e.name))?.name;
        const reactDomUrl = entries.find(e => /\.vite\/deps\/react-dom_client\.js/.test(e.name))?.name;

        if (!reactUrl || !reactDomUrl) {
          console.error('Cannot find Vite-resolved React paths in performance entries');
          return false;
        }

        const React: any = await import(/* @vite-ignore */ reactUrl);
        const ReactDOM: any = await import(/* @vite-ignore */ reactDomUrl);
        const p = '/src/components/file-manager/' + 'RevfsDisabledModal.tsx';
        const mod: any = await import(/* @vite-ignore */ p);
        const { RevfsDisabledModal } = mod;

        const container = document.createElement('div');
        container.id = 'test-revfs-disabled-modal';
        document.body.appendChild(container);

        const ce = React.default?.createElement || React.createElement;
        const cr = ReactDOM.default?.createRoot || ReactDOM.createRoot;

        const root = cr(container);
        root.render(
          ce(RevfsDisabledModal, {
            isOpen: true,
            onClose: () => root.unmount(),
            reason: 'peer_disabled',
          })
        );
        return true;
      } catch (e) {
        console.error('RevfsDisabledModal render error:', e);
        return false;
      }
    });
    if (results.revfsDisabledModalRenders) {
      const modal = page1.getByRole('dialog').filter({ hasText: 'Remote Storage Unavailable' });
      results.revfsDisabledModalRenders = await isVisibleWithin(modal, 5000);
      console.log(`  RevfsDisabledModal renders: ${results.revfsDisabledModalRenders}`);

      // reason: 'peer_disabled' is the branch that labels the dismiss button
      // "OK" (it is "Close" for every other reason).
      const okBtn = modal.getByRole('button', { name: 'OK' });
      if (await isVisibleWithin(okBtn, 2000)) {
        await okBtn.click();
        await isHiddenWithin(modal, 3000);
      }
    } else {
      console.log('  RevfsDisabledModal: could not render via dynamic import');
    }
    await takeScreenshot(page1, '07_revfs_disabled_modal');

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
      results.sortChangeWorks &&
      results.propertiesDialogOpens &&
      results.storageLimitModalRenders &&
      results.revfsDisabledModalRenders;

    console.log(`\n  User1 Created:             ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  User2 Created:             ${results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Registered:            ${results.p2pRegistered ? 'PASS' : 'CHECK'}  (not gated: P2P handshake timing)`);
    console.log(`  File Manager Loaded:       ${results.fileManagerLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`  Sort Control:              ${results.sortControlVisible ? 'PASS' : 'FAIL'}`);
    console.log(`  Sort Change:               ${results.sortChangeWorks ? 'PASS' : 'FAIL'}`);
    console.log(`  Properties Dialog:         ${results.propertiesDialogOpens ? 'PASS' : 'FAIL'}`);
    console.log('  File Preview:              SKIP (needs a completed incoming transfer; this spec sends no files)');
    console.log(`  StorageLimitModal:         ${results.storageLimitModalRenders ? 'PASS' : 'FAIL'}`);
    console.log(`  RevfsDisabledModal:        ${results.revfsDisabledModalRenders ? 'PASS' : 'FAIL'}`);

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
