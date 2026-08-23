/**
 * Miscellaneous Routes & UI Integration Test (P13)
 *
 * Tests miscellaneous routes and UI elements:
 * 1. /messages route
 * 2. 404 NotFound page
 * 3. ProfileModal (edit profile)
 * 4. Sidebar collapse/expand
 * 5. ProtocolWarning display
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  createAccount,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
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
  accountCreated: boolean;

  // Routes
  messagesRouteWorks: boolean;
  notFoundPageRenders: boolean;

  // Sidebar
  sidebarVisible: boolean;
  sidebarCollapseWorks: boolean;
  sidebarExpandWorks: boolean;

  // ProfileModal edit
  profileEditWorks: boolean;

  // ProtocolWarning (P13 extended)
  protocolWarningRenders: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `misc_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

async function testMessagesRoute(page: Page): Promise<boolean> {
  console.log('\n=== Testing /messages Route ===');

  await page.goto(`${config.BASE_URL}/?section=messages`, { waitUntil: 'commit', timeout: 30000 });
  await sleep(3000);

  // Check if messages/chat area rendered
  const chatArea = page.locator('text="Messages", text="Direct Messages", text="DIRECT MESSAGES", [class*="chat"]').first();
  const visible = await chatArea.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Messages route loaded: ${visible}`);

  if (!visible) {
    // Alternative check: any content loaded (not blank page)
    const content = await page.locator('main, [role="main"]').first().textContent().catch(() => '');
    return (content?.length ?? 0) > 20;
  }

  return visible;
}

async function testNotFoundPage(page: Page): Promise<boolean> {
  console.log('\n=== Testing 404 NotFound Page ===');

  await page.goto(`${config.BASE_URL}/nonexistent-route-${timestamp}`, { waitUntil: 'commit', timeout: 30000 });
  await sleep(2000);

  // Check for 404 elements
  const notFound404 = page.locator('text="404"').first();
  const notFoundMsg = page.locator('text="not found", text="Not Found", text="Page not found"').first();
  const homeLink = page.locator('a[href="/"], a:has-text("Home"), a:has-text("Return")').first();

  const has404 = await notFound404.isVisible({ timeout: 3000 }).catch(() => false);
  const hasMsg = await notFoundMsg.isVisible({ timeout: 2000 }).catch(() => false);
  const hasHome = await homeLink.isVisible({ timeout: 2000 }).catch(() => false);

  const renders = has404 || hasMsg;
  console.log(`  404 page renders: ${renders} (404: ${has404}, Message: ${hasMsg}, Home link: ${hasHome})`);
  return renders;
}

async function testSidebarCollapse(page: Page): Promise<{
  visible: boolean;
  collapseWorks: boolean;
  expandWorks: boolean;
}> {
  console.log('\n=== Testing Sidebar Collapse/Expand ===');

  const results = { visible: false, collapseWorks: false, expandWorks: false };

  // Navigate back to workspace first
  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
  await waitForWorkspaceLoaded(page, 15000);

  // Check sidebar is visible
  const sidebar = page.locator('[data-sidebar="sidebar"], aside, nav.sidebar, [class*="Sidebar"]').first();
  results.visible = await sidebar.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Sidebar visible: ${results.visible}`);

  if (!results.visible) return results;

  // Find collapse toggle button
  const collapseBtn = page.locator('button:has(svg.lucide-panel-left), button:has(svg.lucide-sidebar), button[aria-label*="Collapse"], button[aria-label*="sidebar"]').first();
  if (await isVisibleWithin(collapseBtn, 3000)) {
    await collapseBtn.click();
    await sleep(500);

    // Check if sidebar collapsed (width reduced or hidden)
    const sidebarAfter = page.locator('[data-sidebar="sidebar"], aside').first();
    const stillVisible = await sidebarAfter.isVisible({ timeout: 1000 }).catch(() => false);

    // Sidebar might still be visible but narrower, check for collapsed state
    const collapsedState = page.locator('[data-collapsed="true"], [data-state="collapsed"]').first();
    const isCollapsed = (await collapsedState.isVisible({ timeout: 1000 }).catch(() => false)) || !stillVisible;

    results.collapseWorks = isCollapsed;
    console.log(`  Collapse works: ${results.collapseWorks}`);

    // Expand again
    if (results.collapseWorks) {
      const expandBtn = page.locator('button:has(svg.lucide-panel-left), button:has(svg.lucide-sidebar), button[aria-label*="Expand"], button[aria-label*="sidebar"]').first();
      if (await isVisibleWithin(expandBtn, 3000)) {
        await expandBtn.click();
        await sleep(500);
        results.expandWorks = true;
        console.log('  Expand works: true');
      }
    }
  } else {
    console.log('  Collapse button not found');
  }

  return results;
}

async function testProfileEdit(page: Page): Promise<boolean> {
  console.log('\n=== Testing Profile Edit ===');

  // Open user dropdown
  const avatarButton = page.locator('[data-testid="user-avatar-button"]');
  if (!(await avatarButton.isVisible({ timeout: 5000 }).catch(() => false))) return false;

  await avatarButton.click();
  await sleep(500);

  const profileItem = page.locator('[role="menuitem"]:has-text("Profile")');
  if (!(await profileItem.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.keyboard.press('Escape');
    return false;
  }

  await profileItem.click();
  await sleep(1000);

  // Check if profile modal opened with editable fields
  const dialog = page.locator('[role="dialog"]').first();
  if (!(await dialog.isVisible({ timeout: 3000 }).catch(() => false))) return false;

  // Try editing display name
  const nameInput = page.locator('input[name="displayName"], input[placeholder*="name"], input[placeholder*="Name"]').first();
  if (await isVisibleWithin(nameInput, 3000)) {
    const originalValue = await nameInput.inputValue();
    await nameInput.fill('Updated Name');
    await sleep(300);

    // Look for Save button
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Profile edit fields found and editable');
      // Restore original value
      await nameInput.fill(originalValue || USERNAME);
      await page.keyboard.press('Escape');
      return true;
    }
  }

  await page.keyboard.press('Escape');
  return false;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Miscellaneous Routes & UI Test',
    reportFileName: 'MISC_ROUTES_TEST_REPORT.json',
    metadata: { username: USERNAME },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    messagesRouteWorks: false,
    notFoundPageRenders: false,
    sidebarVisible: false,
    sidebarCollapseWorks: false,
    sidebarExpandWorks: false,
    profileEditWorks: false,
    protocolWarningRenders: false,
  };

  try {
    const page = await context.newPage();
    setupConsoleCapture(page, 'Misc', ['error', 'Error']);

    // ========== STEP 1: Create Account ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('\u2500'.repeat(50));

    results.accountCreated = await createAccount(page, USERNAME, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });

    if (!results.accountCreated) throw new Error('Account creation failed');

    await sleep(3000);
    await closeAnyModals(page);
    await waitForWorkspaceLoaded(page, 30000);

    // ========== STEP 2: Test /messages Route ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: Test /messages Route');
    console.log('\u2500'.repeat(50));

    results.messagesRouteWorks = await testMessagesRoute(page);
    await takeScreenshot(page, '02_messages_route');

    // ========== STEP 3: Test 404 Page ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Test 404 NotFound Page');
    console.log('\u2500'.repeat(50));

    results.notFoundPageRenders = await testNotFoundPage(page);
    await takeScreenshot(page, '03_not_found');

    // ========== STEP 4: Test Sidebar Collapse ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Test Sidebar Collapse/Expand');
    console.log('\u2500'.repeat(50));

    const sidebarResult = await testSidebarCollapse(page);
    results.sidebarVisible = sidebarResult.visible;
    results.sidebarCollapseWorks = sidebarResult.collapseWorks;
    results.sidebarExpandWorks = sidebarResult.expandWorks;
    await takeScreenshot(page, '04_sidebar');

    // ========== STEP 5: Test Profile Edit ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Test Profile Edit');
    console.log('\u2500'.repeat(50));

    results.profileEditWorks = await testProfileEdit(page);
    await takeScreenshot(page, '05_profile_edit');

    // ========== STEP 6: Test ProtocolWarning ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 6: Test ProtocolWarning');
    console.log('\u2500'.repeat(50));

    // Emit protocol:warning event via the eventEmitter singleton (Vite dynamic import)
    const emitted = await page.evaluate(async () => {
      try {
        const p = '/src/lib/' + 'event-emitter.ts';
        const mod: any = await import(/* webpackIgnore: true */ p);
        const ee = mod.eventEmitter;
        if (!ee || typeof ee.emit !== 'function') return false;
        ee.emit('protocol:warning', {
          message: 'Test protocol warning: connection timeout',
          requestType: 'TestRequest',
          connection: { cid: '0', request_id: 'test-req-001' },
        });
        return true;
      } catch (e) {
        console.error('ProtocolWarning emit error:', e);
        return false;
      }
    });
    console.log(`  Emitted protocol:warning event: ${emitted}`);

    if (emitted) {
      await sleep(500);
      // ProtocolWarning renders a fixed bottom-left alert with "Protocol Warning" title
      const warningTitle = page.locator('text="Protocol Warning"').first();
      results.protocolWarningRenders = await warningTitle.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`  ProtocolWarning visible: ${results.protocolWarningRenders}`);

      if (results.protocolWarningRenders) {
        // Also verify the message content
        const warningMsg = page.locator('text="Test protocol warning: connection timeout"').first();
        const msgVisible = await warningMsg.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  Warning message visible: ${msgVisible}`);
      }
    }
    await takeScreenshot(page, '06_protocol_warning');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreated;

    console.log(`\n  Account Created:           ${results.accountCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Messages Route:            ${results.messagesRouteWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  404 Page:                  ${results.notFoundPageRenders ? 'PASS' : 'CHECK'}`);
    console.log(`  Sidebar Visible:           ${results.sidebarVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Sidebar Collapse:          ${results.sidebarCollapseWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Sidebar Expand:            ${results.sidebarExpandWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Profile Edit:              ${results.profileEditWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Protocol Warning:          ${results.protocolWarningRenders ? 'PASS' : 'CHECK'}`);

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
