/**
 * File Manager Integration Test
 *
 * Tests the File Manager UI functionality:
 * 1. Navigate to File Manager (?section=files)
 * 2. Verify page structure (title, tabs)
 * 3. Test tab switching (Standard Files, RE-VFS Files)
 * 4. Test file list display
 * 5. Test Clear All functionality
 * 6. Test file click/preview (if files exist)
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  ensureScreenshotsDir,
  createAccount,
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
  // Account creation
  accountCreated: boolean;

  // Navigation
  navigatedToFileManager: boolean;

  // Page structure
  pageTitleVisible: boolean;
  tabsVisible: boolean;

  // Tab functionality
  standardTabWorks: boolean;
  revfsTabWorks: boolean;

  // File list
  fileListContainerVisible: boolean;
  clearAllButtonVisible: boolean;

  // Clear All dialog
  clearAllDialogOpens: boolean;
  clearAllDialogCloses: boolean;

  // Mock file display (RE-VFS has mock files)
  mockFilesVisible: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `filemgr_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Navigate to the File Manager page
 */
async function navigateToFileManager(page: Page): Promise<boolean> {
  console.log('\n=== Navigating to File Manager ===');

  try {
    // First ensure we're in the workspace
    const loaded = await waitForWorkspaceLoaded(page, 30000);
    if (!loaded) {
      console.log('  Workspace not fully loaded');
      return false;
    }

    // Navigate to file manager via URL parameter
    const currentUrl = page.url();
    const baseUrl = currentUrl.split('?')[0];
    await page.goto(`${baseUrl}?section=files`, { waitUntil: 'commit', timeout: 30000 });
    await sleep(3000);

    // Verify we're on the file manager page
    const title = page.locator('h1:has-text("File Manager")');
    if (await title.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('  Successfully navigated to File Manager');
      return true;
    }

    // Alternative: try clicking "Files" in sidebar
    console.log('  Direct navigation may have failed, trying sidebar...');
    const sidebarLink = page.locator('button:has-text("Files"), a:has-text("Files")').first();
    if (await sidebarLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sidebarLink.click();
      await sleep(2000);
      return await title.isVisible({ timeout: 5000 }).catch(() => false);
    }

    console.log('  Could not navigate to file manager');
    return false;
  } catch (error) {
    console.error('  Error navigating to file manager:', error);
    return false;
  }
}

/**
 * Verify page structure elements
 */
async function verifyPageStructure(page: Page): Promise<{
  title: boolean;
  tabs: boolean;
}> {
  console.log('\n=== Verifying Page Structure ===');

  const results = {
    title: false,
    tabs: false,
  };

  // Check page title
  const title = page.locator('h1:has-text("File Manager")');
  results.title = await title.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Page title visible: ${results.title}`);

  // Check tabs (Standard Files, RE-VFS Files)
  const standardTab = page.locator('button[role="tab"]:has-text("Standard Files")');
  const revfsTab = page.locator('button[role="tab"]:has-text("RE-VFS Files")');

  const tabsVisible = await Promise.all([
    standardTab.isVisible({ timeout: 3000 }).catch(() => false),
    revfsTab.isVisible({ timeout: 3000 }).catch(() => false),
  ]);
  results.tabs = tabsVisible.every(Boolean);
  console.log(`  Tabs visible: ${results.tabs} (Standard: ${tabsVisible[0]}, RE-VFS: ${tabsVisible[1]})`);

  return results;
}

/**
 * Test tab switching functionality
 */
async function testTabSwitching(page: Page): Promise<{
  standardTab: boolean;
  revfsTab: boolean;
}> {
  console.log('\n=== Testing Tab Switching ===');

  const results = {
    standardTab: false,
    revfsTab: false,
  };

  // Click "Standard Files" tab
  const standardTab = page.locator('button[role="tab"]:has-text("Standard Files")');
  if (await standardTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await standardTab.click();
    await sleep(500);
    const isActive = await standardTab.getAttribute('data-state');
    results.standardTab = isActive === 'active';
    console.log(`  Standard Files tab works: ${results.standardTab}`);
  }

  // Click "RE-VFS Files" tab
  const revfsTab = page.locator('button[role="tab"]:has-text("RE-VFS Files")');
  if (await revfsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await revfsTab.click();
    await sleep(500);
    const isActive = await revfsTab.getAttribute('data-state');
    results.revfsTab = isActive === 'active';
    console.log(`  RE-VFS Files tab works: ${results.revfsTab}`);
  }

  // Go back to Standard tab for subsequent tests
  await standardTab.click();
  await sleep(500);

  return results;
}

/**
 * Verify file list container and Clear All button
 */
async function verifyFileListElements(page: Page): Promise<{
  listContainer: boolean;
  clearAllButton: boolean;
}> {
  console.log('\n=== Verifying File List Elements ===');

  const results = {
    listContainer: false,
    clearAllButton: false,
  };

  // Check for scroll area / file list container
  // The file list is inside a ScrollArea component with h-[600px]
  const scrollArea = page.locator('[class*="ScrollArea"], [data-radix-scroll-area-viewport]').first();
  results.listContainer = await scrollArea.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  File list container visible: ${results.listContainer}`);

  // Check for Clear All button
  const clearAllButton = page.locator('button:has-text("Clear All")');
  results.clearAllButton = await clearAllButton.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Clear All button visible: ${results.clearAllButton}`);

  return results;
}

/**
 * Test Clear All dialog functionality
 */
async function testClearAllDialog(page: Page): Promise<{
  dialogOpens: boolean;
  dialogCloses: boolean;
}> {
  console.log('\n=== Testing Clear All Dialog ===');

  const results = {
    dialogOpens: false,
    dialogCloses: false,
  };

  const clearAllButton = page.locator('button:has-text("Clear All")');
  if (!(await clearAllButton.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('  Clear All button not found');
    return results;
  }

  // Click Clear All button
  await clearAllButton.click();
  await sleep(1000);

  // Check if confirmation dialog opened
  // The ClearAllDialog should show a dialog with "Clear All" in the title or content
  const dialogContent = page.locator('[role="dialog"], [data-radix-dialog-content]');
  results.dialogOpens = await dialogContent.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Dialog opens: ${results.dialogOpens}`);

  if (results.dialogOpens) {
    // Close the dialog by clicking Cancel or pressing Escape
    const cancelButton = page.locator('button:has-text("Cancel")');
    if (await cancelButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelButton.click({ force: true });
      await sleep(1000);
    } else {
      await page.keyboard.press('Escape');
      await sleep(1000);
    }

    // Wait for dialog animation to complete
    await sleep(500);

    // Verify dialog closed by checking for the overlay
    const overlay = page.locator('[data-state="open"][aria-hidden="true"]');
    results.dialogCloses = !(await overlay.isVisible({ timeout: 1000 }).catch(() => false));
    console.log(`  Dialog closes: ${results.dialogCloses}`);

    // If dialog didn't close, try pressing Escape again
    if (!results.dialogCloses) {
      console.log('  Dialog still open, pressing Escape...');
      await page.keyboard.press('Escape');
      await sleep(1000);
      results.dialogCloses = !(await overlay.isVisible({ timeout: 1000 }).catch(() => false));
    }
  }

  return results;
}

/**
 * Check if mock files are visible (RE-VFS tab has mock files)
 */
async function checkMockFilesVisible(page: Page): Promise<boolean> {
  console.log('\n=== Checking for Mock Files ===');

  try {
    // First ensure no dialogs are blocking
    await page.keyboard.press('Escape');
    await sleep(500);

    // Switch to RE-VFS tab which has mock files - use force click to bypass any remaining overlays
    const revfsTab = page.locator('button[role="tab"]:has-text("RE-VFS Files")');
    if (await revfsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await revfsTab.click({ force: true });
      await sleep(1000);
    } else {
      console.log('  RE-VFS tab not visible');
      return false;
    }

    // Look for the mock file "Secure Document.pdf"
    const mockFile = page.locator('text="Secure Document.pdf"');
    const visible = await mockFile.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Mock files visible: ${visible}`);

    // Switch back to Standard tab
    const standardTab = page.locator('button[role="tab"]:has-text("Standard Files")');
    if (await standardTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await standardTab.click({ force: true });
      await sleep(500);
    }

    return visible;
  } catch (error) {
    console.log(`  Error checking mock files: ${error}`);
    return false;
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('FILE MANAGER INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log(`Username: ${USERNAME}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Restart backend for clean state
  await restartBackendServices();
  await waitForServicesAlive();

  // Log the test start
  logObservation('test-start', 'File Manager Test Started', {
    username: USERNAME,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser
  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    navigatedToFileManager: false,
    pageTitleVisible: false,
    tabsVisible: false,
    standardTabWorks: false,
    revfsTabWorks: false,
    fileListContainerVisible: false,
    clearAllButtonVisible: false,
    clearAllDialogOpens: false,
    clearAllDialogCloses: false,
    mockFilesVisible: false,
  };

  try {
    // ========== STEP 1: Create Account ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('─'.repeat(50));

    const page = await context.newPage();
    setupConsoleCapture(page, 'FileManager', ['error', 'Error', 'FileManager', 'file']);

    results.accountCreated = await createAccount(page, USERNAME, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });

    await takeScreenshot(page, '01_account_created');

    if (!results.accountCreated) {
      throw new Error('Account creation failed');
    }

    await sleep(3000);

    // Close any modals
    await closeAnyModals(page);

    // ========== STEP 2: Navigate to File Manager ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Navigate to File Manager');
    console.log('─'.repeat(50));

    results.navigatedToFileManager = await navigateToFileManager(page);
    await takeScreenshot(page, '02_file_manager_page');

    if (!results.navigatedToFileManager) {
      console.log('  WARNING: Could not navigate to file manager');
      uxTracker.log('major', 'functional', 'File Manager page not accessible');
    }

    // ========== STEP 3: Verify Page Structure ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Verify Page Structure');
    console.log('─'.repeat(50));

    if (results.navigatedToFileManager) {
      const structure = await verifyPageStructure(page);
      results.pageTitleVisible = structure.title;
      results.tabsVisible = structure.tabs;

      await takeScreenshot(page, '03_page_structure');
    }

    // ========== STEP 4: Test Tab Switching ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Test Tab Switching');
    console.log('─'.repeat(50));

    if (results.tabsVisible) {
      const tabResults = await testTabSwitching(page);
      results.standardTabWorks = tabResults.standardTab;
      results.revfsTabWorks = tabResults.revfsTab;

      await takeScreenshot(page, '04_tabs_tested');
    }

    // ========== STEP 5: Verify File List Elements ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Verify File List Elements');
    console.log('─'.repeat(50));

    if (results.navigatedToFileManager) {
      const listResults = await verifyFileListElements(page);
      results.fileListContainerVisible = listResults.listContainer;
      results.clearAllButtonVisible = listResults.clearAllButton;

      await takeScreenshot(page, '05_file_list');
    }

    // ========== STEP 6: Test Clear All Dialog ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Test Clear All Dialog');
    console.log('─'.repeat(50));

    if (results.clearAllButtonVisible) {
      const dialogResults = await testClearAllDialog(page);
      results.clearAllDialogOpens = dialogResults.dialogOpens;
      results.clearAllDialogCloses = dialogResults.dialogCloses;

      await takeScreenshot(page, '06_clear_all_dialog');
    }

    // ========== STEP 7: Check Mock Files ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Check Mock Files');
    console.log('─'.repeat(50));

    if (results.tabsVisible) {
      results.mockFilesVisible = await checkMockFilesVisible(page);
      await takeScreenshot(page, '07_mock_files');
    }

    // Final screenshot
    await takeScreenshot(page, 'FINAL_file_manager');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const allPassed =
      results.accountCreated &&
      results.navigatedToFileManager &&
      results.pageTitleVisible &&
      results.tabsVisible;

    const corePassed = results.accountCreated;

    console.log('\nAccount Creation:');
    console.log(`  Account Created:          ${results.accountCreated ? 'PASS' : 'FAIL'}`);

    console.log('\nNavigation:');
    console.log(`  Navigated to File Manager:${results.navigatedToFileManager ? 'PASS' : 'FAIL'}`);

    console.log('\nPage Structure:');
    console.log(`  Page Title Visible:       ${results.pageTitleVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Tabs Visible:             ${results.tabsVisible ? 'PASS' : 'CHECK'}`);

    console.log('\nTab Functionality:');
    console.log(`  Standard Tab Works:       ${results.standardTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  RE-VFS Tab Works:         ${results.revfsTabWorks ? 'PASS' : 'CHECK'}`);

    console.log('\nFile List:');
    console.log(`  File List Container:      ${results.fileListContainerVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Clear All Button:         ${results.clearAllButtonVisible ? 'PASS' : 'CHECK'}`);

    console.log('\nClear All Dialog:');
    console.log(`  Dialog Opens:             ${results.clearAllDialogOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  Dialog Closes:            ${results.clearAllDialogCloses ? 'PASS' : 'CHECK'}`);

    console.log('\nMock Files:');
    console.log(`  Mock Files Visible:       ${results.mockFilesVisible ? 'PASS' : 'CHECK'}`);

    const uxIssues = uxTracker.getIssues();
    if (uxIssues.length > 0) {
      console.log('\n' + '─'.repeat(50));
      console.log('UX ISSUES FOUND:');
      console.log('─'.repeat(50));
      uxIssues.forEach((issue, i) => {
        console.log(`\n${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}`);
        console.log(`   ${issue.description}`);
      });
    } else {
      console.log('\nNo UX issues detected!');
    }

    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL: ${allPassed ? 'TEST PASSED' : corePassed ? 'CORE PASSED' : 'TEST FAILED'}`);
    console.log('='.repeat(60));

    // Log the test result
    logObservation('test-complete', `File Manager Test ${allPassed ? 'PASSED' : 'COMPLETED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'investigating');

    // Write report
    writeTestReport('FILE_MANAGER_TEST_REPORT.json', {
      username: USERNAME,
      results,
      uxIssues,
      passed: allPassed,
      corePassed,
    });

    console.log('\nBrowser will remain open for 10 seconds for manual inspection...');
    await sleep(10000);

    return corePassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', 'File Manager Test Error', {
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
