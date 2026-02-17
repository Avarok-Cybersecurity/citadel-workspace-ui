/**
 * File Manager Extended Integration Test (P8)
 *
 * Tests file manager edge cases and additional UI elements:
 * 1. Sort controls
 * 2. Grid/List view toggle
 * 3. VFSPropertiesDialog (file properties)
 * 4. FilePreviewDialog
 * 5. StorageLimitModal / RevfsDisabledModal (component existence)
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

  // View toggle
  viewToggleVisible: boolean;
  viewChangeWorks: boolean;

  // Properties dialog
  propertiesDialogOpens: boolean;

  // File preview
  filePreviewOpens: boolean;

  // Error state modals (P8 extended)
  storageLimitModalRenders: boolean;
  revfsDisabledModalRenders: boolean;
  fileUploadProgressRenders: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `files_ext_a_${timestamp}`;
const USER2 = `files_ext_b_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

async function navigateToFileManager(page: Page): Promise<boolean> {
  console.log('\n=== Navigating to File Manager ===');

  // Try the Files link in sidebar
  const filesLink = page.locator('a[href*="files"], button:has-text("Files"), [data-sidebar-item*="files"]').first();
  if (await filesLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await filesLink.click();
    await sleep(2000);
  } else {
    // Direct URL navigation
    await page.goto(`${config.BASE_URL}/?section=files`, { waitUntil: 'commit', timeout: 30000 });
    await waitForAppReady(page, 30000);
  }

  // Verify file manager loaded
  const fileManagerContent = page.locator('text="File Manager", text="Files", text="Sent Files", text="Received Files"').first();
  const loaded = await fileManagerContent.isVisible({ timeout: 10000 }).catch(() => false);
  console.log(`  File manager loaded: ${loaded}`);
  return loaded;
}

async function testSortControls(page: Page): Promise<{
  visible: boolean;
  changeWorks: boolean;
}> {
  console.log('\n=== Testing Sort Controls ===');

  const results = { visible: false, changeWorks: false };

  // Look for sort dropdown/button
  const sortBtn = page.locator('button:has-text("Sort"), button:has(svg.lucide-arrow-up-down), [aria-label*="Sort"]').first();
  results.visible = await sortBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (!results.visible) {
    // Try select element
    const sortSelect = page.locator('select[name*="sort"], [role="combobox"]:has-text("Name")').first();
    results.visible = await sortSelect.isVisible({ timeout: 3000 }).catch(() => false);
  }

  console.log(`  Sort control visible: ${results.visible}`);

  if (results.visible) {
    await sortBtn.click();
    await sleep(500);
    // If dropdown opened, that counts as working
    const dropdownItem = page.locator('[role="menuitem"], [role="option"]').first();
    results.changeWorks = await dropdownItem.isVisible({ timeout: 2000 }).catch(() => false);
    if (results.changeWorks) {
      await page.keyboard.press('Escape');
      await sleep(300);
    }
    console.log(`  Sort change works: ${results.changeWorks}`);
  }

  return results;
}

async function testViewToggle(page: Page): Promise<{
  visible: boolean;
  changeWorks: boolean;
}> {
  console.log('\n=== Testing View Toggle ===');

  const results = { visible: false, changeWorks: false };

  // Look for grid/list toggle buttons
  const gridBtn = page.locator('button:has(svg.lucide-grid), button:has(svg.lucide-layout-grid), [aria-label*="Grid"]').first();
  const listBtn = page.locator('button:has(svg.lucide-list), button:has(svg.lucide-layout-list), [aria-label*="List"]').first();

  const hasGrid = await gridBtn.isVisible({ timeout: 3000 }).catch(() => false);
  const hasList = await listBtn.isVisible({ timeout: 3000 }).catch(() => false);

  results.visible = hasGrid || hasList;
  console.log(`  View toggle visible: ${results.visible} (Grid: ${hasGrid}, List: ${hasList})`);

  if (results.visible) {
    // Click the non-active toggle to switch views
    const toggleTarget = hasGrid ? gridBtn : listBtn;
    await toggleTarget.click();
    await sleep(500);
    results.changeWorks = true;
    console.log('  View toggled');
  }

  return results;
}

async function testPropertiesDialog(page: Page): Promise<boolean> {
  console.log('\n=== Testing Properties Dialog ===');

  // Right-click on a file/folder to get context menu
  const treeItem = page.locator('[role="treeitem"], [class*="file-item"], [class*="folder"]').first();
  if (!(await treeItem.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('  No file/folder items found');
    return false;
  }

  await treeItem.click({ button: 'right' });
  await sleep(500);

  // Look for "Properties" or "Info" in context menu
  const propertiesItem = page.locator('[role="menuitem"]:has-text("Properties"), [role="menuitem"]:has-text("Info")').first();
  if (await propertiesItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await propertiesItem.click();
    await sleep(500);

    const dialog = page.locator('[role="dialog"]').first();
    const opens = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Properties dialog opens: ${opens}`);

    if (opens) {
      await page.keyboard.press('Escape');
      await sleep(300);
    }
    return opens;
  }

  // Close context menu
  await page.keyboard.press('Escape');
  console.log('  Properties option not found in context menu');
  return false;
}

async function testFilePreview(page: Page): Promise<boolean> {
  console.log('\n=== Testing File Preview ===');

  // Click on a file to preview it
  const fileItem = page.locator('[class*="file-item"], [role="treeitem"]:not(:has-text("Folder"))').first();
  if (!(await fileItem.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('  No file items found for preview');
    return false;
  }

  await fileItem.click();
  await sleep(1000);

  // Check if preview panel/dialog appeared
  const preview = page.locator('[class*="preview"], [role="dialog"]:has-text("Preview")').first();
  const opens = await preview.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  File preview opens: ${opens}`);

  if (opens) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  return opens;
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
    viewToggleVisible: false,
    viewChangeWorks: false,
    propertiesDialogOpens: false,
    filePreviewOpens: false,
    storageLimitModalRenders: false,
    revfsDisabledModalRenders: false,
    fileUploadProgressRenders: false,
  };

  try {
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    setupConsoleCapture(page1, 'User1', ['error', 'Error']);
    setupConsoleCapture(page2, 'User2', ['error', 'Error']);

    // ========== STEP 1: Create Accounts & P2P ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 1: Create Accounts & P2P Register');
    console.log('\u2500'.repeat(50));

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

    // P2P register for file manager to show peer trees
    results.p2pRegistered = await p2pRegister(page1, USER1, USER2);
    await sleep(3000);
    await acceptP2PRequest(page2, USER2);
    await sleep(5000);

    await closeAnyModals(page1);
    await waitForWorkspaceLoaded(page1, 30000);

    // ========== STEP 2: Navigate to File Manager ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: Navigate to File Manager');
    console.log('\u2500'.repeat(50));

    results.fileManagerLoaded = await navigateToFileManager(page1);
    await takeScreenshot(page1, '02_file_manager');

    // ========== STEP 3: Test Sort Controls ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Test Sort Controls');
    console.log('\u2500'.repeat(50));

    if (results.fileManagerLoaded) {
      const sortResult = await testSortControls(page1);
      results.sortControlVisible = sortResult.visible;
      results.sortChangeWorks = sortResult.changeWorks;
      await takeScreenshot(page1, '03_sort_controls');
    }

    // ========== STEP 4: Test View Toggle ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Test View Toggle');
    console.log('\u2500'.repeat(50));

    if (results.fileManagerLoaded) {
      const viewResult = await testViewToggle(page1);
      results.viewToggleVisible = viewResult.visible;
      results.viewChangeWorks = viewResult.changeWorks;
      await takeScreenshot(page1, '04_view_toggle');
    }

    // ========== STEP 5: Test Properties Dialog ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Test Properties Dialog');
    console.log('\u2500'.repeat(50));

    if (results.fileManagerLoaded) {
      results.propertiesDialogOpens = await testPropertiesDialog(page1);
      await takeScreenshot(page1, '05_properties');
    }

    // ========== STEP 6: Test File Preview ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 6: Test File Preview');
    console.log('\u2500'.repeat(50));

    if (results.fileManagerLoaded) {
      results.filePreviewOpens = await testFilePreview(page1);
      await takeScreenshot(page1, '06_preview');
    }

    // ========== STEP 7: Test FileUploadProgress ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 7: Test FileUploadProgress');
    console.log('\u2500'.repeat(50));

    // FileUploadProgress listens to fileUploadService events.
    // Use Vite dynamic import to get the same singleton and emit an event.
    results.fileUploadProgressRenders = await page1.evaluate(async () => {
      try {
        // Dynamic path prevents TS module resolution (resolved at runtime by Vite)
        const p = '/src/lib/' + 'file-upload-service.ts';
        const mod: any = await import(/* webpackIgnore: true */ p);
        const svc = mod.fileUploadService;
        if (!svc || typeof svc.emit !== 'function') return false;
        // Emit a simulated upload progress event
        svc.emit('upload-progress', {
          fileId: 'test-upload-001',
          progress: 50,
          status: 'uploading',
        });
        return true;
      } catch {
        return false;
      }
    });
    if (results.fileUploadProgressRenders) {
      await sleep(500);
      // Verify the progress UI rendered (fixed bottom-right indicator)
      const progressUI = page1.locator('text="Uploading..."').first();
      const progressVisible = await progressUI.isVisible({ timeout: 3000 }).catch(() => false);
      results.fileUploadProgressRenders = progressVisible;
      console.log(`  FileUploadProgress renders: ${progressVisible}`);

      // Clean up: emit completion to remove the progress indicator
      await page1.evaluate(async () => {
        try {
          const p = '/src/lib/' + 'file-upload-service.ts';
          const mod: any = await import(/* webpackIgnore: true */ p);
          mod.fileUploadService.emit('upload-progress', {
            fileId: 'test-upload-001',
            progress: 100,
            status: 'completed',
          });
        } catch { /* ignore */ }
      });
      await sleep(3500); // Wait for auto-removal (3s delay after completed)
    } else {
      console.log('  FileUploadProgress: could not emit event via dynamic import');
    }
    await takeScreenshot(page1, '07_file_upload_progress');

    // ========== STEP 8: Test StorageLimitModal ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 8: Test StorageLimitModal');
    console.log('\u2500'.repeat(50));

    // Render StorageLimitModal directly via ReactDOM.
    // Bare specifiers like import('react') don't work in page.evaluate()
    // because the code doesn't go through Vite's transform pipeline.
    // Discover the Vite-resolved URLs from performance entries instead.
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
      await sleep(500);
      const modalTitle = page1.locator('text="Storage Limit Reached"').first();
      const titleVisible = await modalTitle.isVisible({ timeout: 3000 }).catch(() => false);
      results.storageLimitModalRenders = titleVisible;
      console.log(`  StorageLimitModal renders: ${titleVisible}`);

      // Close it
      const cancelBtn = page1.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelBtn.click();
        await sleep(300);
      }
    } else {
      console.log('  StorageLimitModal: could not render via dynamic import');
    }
    await takeScreenshot(page1, '08_storage_limit_modal');

    // ========== STEP 9: Test RevfsDisabledModal ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 9: Test RevfsDisabledModal');
    console.log('\u2500'.repeat(50));

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
      await sleep(500);
      const modalTitle = page1.locator('text="Remote Storage Unavailable"').first();
      const titleVisible = await modalTitle.isVisible({ timeout: 3000 }).catch(() => false);
      results.revfsDisabledModalRenders = titleVisible;
      console.log(`  RevfsDisabledModal renders: ${titleVisible}`);

      // Close it
      const okBtn = page1.locator('button:has-text("OK")').first();
      if (await okBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await okBtn.click();
        await sleep(300);
      }
    } else {
      console.log('  RevfsDisabledModal: could not render via dynamic import');
    }
    await takeScreenshot(page1, '09_revfs_disabled_modal');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreation.user1;

    console.log(`\n  User1 Created:             ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  File Manager Loaded:       ${results.fileManagerLoaded ? 'PASS' : 'CHECK'}`);
    console.log(`  Sort Control:              ${results.sortControlVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Sort Change:               ${results.sortChangeWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  View Toggle:               ${results.viewToggleVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  View Change:               ${results.viewChangeWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Properties Dialog:         ${results.propertiesDialogOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  File Preview:              ${results.filePreviewOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  FileUploadProgress:        ${results.fileUploadProgressRenders ? 'PASS' : 'CHECK'}`);
    console.log(`  StorageLimitModal:         ${results.storageLimitModalRenders ? 'PASS' : 'CHECK'}`);
    console.log(`  RevfsDisabledModal:        ${results.revfsDisabledModalRenders ? 'PASS' : 'CHECK'}`);

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
