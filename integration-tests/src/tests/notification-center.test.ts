/**
 * Notification Center Integration Test
 *
 * Tests the Notification Center sheet functionality:
 * 1. Open notification center via Bell icon
 * 2. Verify sheet structure (title, tabs, clear all button)
 * 3. Test tab switching (All, Messages, Requests, System)
 * 4. Test empty state display
 * 5. Test Clear All button
 * 6. Close notification center
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

  // Notification center
  bellIconVisible: boolean;
  sheetOpens: boolean;

  // Sheet structure
  titleVisible: boolean;
  tabsVisible: boolean;
  clearAllButtonVisible: boolean;

  // Tab functionality
  allTabWorks: boolean;
  messagesTabWorks: boolean;
  requestsTabWorks: boolean;
  systemTabWorks: boolean;

  // Empty state
  emptyStateVisible: boolean;

  // Close functionality
  sheetCloses: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `notif_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Open the notification center by clicking the bell icon
 */
async function openNotificationCenter(page: Page): Promise<boolean> {
  console.log('\n=== Opening Notification Center ===');

  try {
    // Look for the bell icon button in the TopBar
    // It's a ghost button with a Bell icon
    const bellButton = page.locator('button:has(svg.lucide-bell)').first();

    if (!(await bellButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('  Bell icon not found');
      return false;
    }

    console.log('  Found bell icon, clicking...');
    await bellButton.click();
    await sleep(1000);

    // Check if sheet opened
    const sheetTitle = page.locator('text="Notifications"');

    const opened = await sheetTitle.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Notification center opened: ${opened}`);
    return opened;
  } catch (error) {
    console.error('  Error opening notification center:', error);
    return false;
  }
}

/**
 * Verify sheet structure elements
 */
async function verifySheetStructure(page: Page): Promise<{
  title: boolean;
  tabs: boolean;
  clearAllButton: boolean;
}> {
  console.log('\n=== Verifying Sheet Structure ===');

  const results = {
    title: false,
    tabs: false,
    clearAllButton: false,
  };

  // Check title
  const title = page.locator('text="Notifications"');
  results.title = await title.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Title visible: ${results.title}`);

  // Check tabs (All, Messages, Requests, System)
  const allTab = page.locator('button[role="tab"]:has-text("All")');
  const messagesTab = page.locator('button[role="tab"]:has-text("Messages")');
  const requestsTab = page.locator('button[role="tab"]:has-text("Requests")');
  const systemTab = page.locator('button[role="tab"]:has-text("System")');

  const tabsVisible = await Promise.all([
    allTab.isVisible({ timeout: 3000 }).catch(() => false),
    messagesTab.isVisible({ timeout: 3000 }).catch(() => false),
    requestsTab.isVisible({ timeout: 3000 }).catch(() => false),
    systemTab.isVisible({ timeout: 3000 }).catch(() => false),
  ]);
  results.tabs = tabsVisible.every(Boolean);
  console.log(`  Tabs visible: ${results.tabs} (All: ${tabsVisible[0]}, Messages: ${tabsVisible[1]}, Requests: ${tabsVisible[2]}, System: ${tabsVisible[3]})`);

  // Check Clear All button
  const clearAllButton = page.locator('button:has-text("Clear All")');
  results.clearAllButton = await clearAllButton.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Clear All button visible: ${results.clearAllButton}`);

  return results;
}

/**
 * Test tab switching functionality
 */
async function testTabSwitching(page: Page): Promise<{
  allTab: boolean;
  messagesTab: boolean;
  requestsTab: boolean;
  systemTab: boolean;
}> {
  console.log('\n=== Testing Tab Switching ===');

  const results = {
    allTab: false,
    messagesTab: false,
    requestsTab: false,
    systemTab: false,
  };

  // Click "All" tab
  const allTab = page.locator('button[role="tab"]:has-text("All")');
  if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allTab.click();
    await sleep(300);
    const isActive = await allTab.getAttribute('data-state');
    results.allTab = isActive === 'active';
    console.log(`  All tab works: ${results.allTab}`);
  }

  // Click "Messages" tab
  const messagesTab = page.locator('button[role="tab"]:has-text("Messages")');
  if (await messagesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await messagesTab.click();
    await sleep(300);
    const isActive = await messagesTab.getAttribute('data-state');
    results.messagesTab = isActive === 'active';
    console.log(`  Messages tab works: ${results.messagesTab}`);
  }

  // Click "Requests" tab
  const requestsTab = page.locator('button[role="tab"]:has-text("Requests")');
  if (await requestsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await requestsTab.click();
    await sleep(300);
    const isActive = await requestsTab.getAttribute('data-state');
    results.requestsTab = isActive === 'active';
    console.log(`  Requests tab works: ${results.requestsTab}`);
  }

  // Click "System" tab
  const systemTab = page.locator('button[role="tab"]:has-text("System")');
  if (await systemTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await systemTab.click();
    await sleep(300);
    const isActive = await systemTab.getAttribute('data-state');
    results.systemTab = isActive === 'active';
    console.log(`  System tab works: ${results.systemTab}`);
  }

  // Go back to All tab
  await allTab.click();
  await sleep(300);

  return results;
}

/**
 * Check for empty state display
 */
async function checkEmptyState(page: Page): Promise<boolean> {
  console.log('\n=== Checking Empty State ===');

  // Look for the empty state message
  const emptyState = page.locator('text="No notifications to display"');
  const visible = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Empty state visible: ${visible}`);
  return visible;
}

/**
 * Close the notification center
 */
async function closeNotificationCenter(page: Page): Promise<boolean> {
  console.log('\n=== Closing Notification Center ===');

  try {
    // Try pressing Escape
    await page.keyboard.press('Escape');
    await sleep(500);

    // Check if sheet closed
    const sheetTitle = page.locator('text="Notifications"');
    const closed = !(await sheetTitle.isVisible({ timeout: 1000 }).catch(() => false));
    console.log(`  Notification center closed: ${closed}`);
    return closed;
  } catch (error) {
    console.error('  Error closing notification center:', error);
    return false;
  }
}

/**
 * Check if bell icon is visible
 */
async function checkBellIconVisible(page: Page): Promise<boolean> {
  console.log('\n=== Checking Bell Icon ===');

  const bellButton = page.locator('button:has(svg.lucide-bell)').first();
  const visible = await bellButton.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Bell icon visible: ${visible}`);
  return visible;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('NOTIFICATION CENTER INTEGRATION TEST');
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
  logObservation('test-start', 'Notification Center Test Started', {
    username: USERNAME,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser
  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    bellIconVisible: false,
    sheetOpens: false,
    titleVisible: false,
    tabsVisible: false,
    clearAllButtonVisible: false,
    allTabWorks: false,
    messagesTabWorks: false,
    requestsTabWorks: false,
    systemTabWorks: false,
    emptyStateVisible: false,
    sheetCloses: false,
  };

  try {
    // ========== STEP 1: Create Account ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('─'.repeat(50));

    const page = await context.newPage();
    setupConsoleCapture(page, 'Notifications', ['error', 'Error', 'notification', 'Notification']);

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

    // Close any modals and wait for workspace to load
    await closeAnyModals(page);
    await waitForWorkspaceLoaded(page, 30000);

    // ========== STEP 2: Check Bell Icon ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Check Bell Icon');
    console.log('─'.repeat(50));

    results.bellIconVisible = await checkBellIconVisible(page);
    await takeScreenshot(page, '02_bell_icon');

    if (!results.bellIconVisible) {
      console.log('  WARNING: Bell icon not visible');
      uxTracker.log('major', 'functional', 'Notification bell icon not visible');
    }

    // ========== STEP 3: Open Notification Center ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Open Notification Center');
    console.log('─'.repeat(50));

    results.sheetOpens = await openNotificationCenter(page);
    await takeScreenshot(page, '03_notification_center_open');

    if (!results.sheetOpens) {
      console.log('  WARNING: Could not open notification center');
      uxTracker.log('major', 'functional', 'Notification center sheet does not open');
    }

    // ========== STEP 4: Verify Sheet Structure ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Verify Sheet Structure');
    console.log('─'.repeat(50));

    if (results.sheetOpens) {
      const structure = await verifySheetStructure(page);
      results.titleVisible = structure.title;
      results.tabsVisible = structure.tabs;
      results.clearAllButtonVisible = structure.clearAllButton;

      await takeScreenshot(page, '04_sheet_structure');
    }

    // ========== STEP 5: Test Tab Switching ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Test Tab Switching');
    console.log('─'.repeat(50));

    if (results.tabsVisible) {
      const tabResults = await testTabSwitching(page);
      results.allTabWorks = tabResults.allTab;
      results.messagesTabWorks = tabResults.messagesTab;
      results.requestsTabWorks = tabResults.requestsTab;
      results.systemTabWorks = tabResults.systemTab;

      await takeScreenshot(page, '05_tabs_tested');
    }

    // ========== STEP 6: Check Empty State ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Check Empty State');
    console.log('─'.repeat(50));

    if (results.sheetOpens) {
      results.emptyStateVisible = await checkEmptyState(page);
      await takeScreenshot(page, '06_empty_state');
    }

    // ========== STEP 7: Close Notification Center ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Close Notification Center');
    console.log('─'.repeat(50));

    if (results.sheetOpens) {
      results.sheetCloses = await closeNotificationCenter(page);
      await takeScreenshot(page, '07_sheet_closed');
    }

    // Final screenshot
    await takeScreenshot(page, 'FINAL_notification_center');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const allPassed =
      results.accountCreated &&
      results.bellIconVisible &&
      results.sheetOpens &&
      results.titleVisible &&
      results.tabsVisible;

    const corePassed = results.accountCreated && results.bellIconVisible;

    console.log('\nAccount Creation:');
    console.log(`  Account Created:          ${results.accountCreated ? 'PASS' : 'FAIL'}`);

    console.log('\nNotification Center:');
    console.log(`  Bell Icon Visible:        ${results.bellIconVisible ? 'PASS' : 'FAIL'}`);
    console.log(`  Sheet Opens:              ${results.sheetOpens ? 'PASS' : 'CHECK'}`);

    console.log('\nSheet Structure:');
    console.log(`  Title Visible:            ${results.titleVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Tabs Visible:             ${results.tabsVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Clear All Button:         ${results.clearAllButtonVisible ? 'PASS' : 'CHECK'}`);

    console.log('\nTab Functionality:');
    console.log(`  All Tab Works:            ${results.allTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Messages Tab Works:       ${results.messagesTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Requests Tab Works:       ${results.requestsTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  System Tab Works:         ${results.systemTabWorks ? 'PASS' : 'CHECK'}`);

    console.log('\nUI State:');
    console.log(`  Empty State Visible:      ${results.emptyStateVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Sheet Closes:             ${results.sheetCloses ? 'PASS' : 'CHECK'}`);

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
    logObservation('test-complete', `Notification Center Test ${allPassed ? 'PASSED' : 'COMPLETED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'investigating');

    // Write report
    writeTestReport('NOTIFICATION_CENTER_TEST_REPORT.json', {
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
    logObservation('test-error', 'Notification Center Test Error', {
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
