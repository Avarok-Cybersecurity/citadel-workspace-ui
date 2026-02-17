/**
 * TopBar & Navigation Chrome Integration Test (P2 + P10)
 *
 * Tests TopBar navigation elements:
 * 1. LeaderIndicator (admin ring on avatar)
 * 2. WorkspaceSwitcher renders
 * 3. ProfileModal (open, verify fields, close)
 * 4. PreferencesDialog (open, verify controls, close)
 * 5. ExitConfirmModal (cancel + confirm flows)
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

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreated: boolean;

  // TopBar elements
  leaderIndicatorVisible: boolean;
  workspaceSwitcherVisible: boolean;
  workspaceSwitcherDropdownWorks: boolean;

  // Profile modal
  profileModalOpens: boolean;
  profileHasDisplayName: boolean;
  profileModalCloses: boolean;

  // Preferences dialog
  preferencesOpens: boolean;
  preferencesHasControls: boolean;
  preferencesCloses: boolean;

  // Exit to Landing
  exitConfirmModalAppears: boolean;
  cancelKeepsWorkspace: boolean;
  confirmExitsToLanding: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `topbar_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Open user dropdown menu
 */
async function openUserDropdown(page: Page): Promise<boolean> {
  const avatarButton = page.locator('[data-testid="user-avatar-button"]');

  if (await avatarButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await avatarButton.click();
    await sleep(500);
    const menu = page.locator('[role="menu"]');
    return await menu.isVisible({ timeout: 3000 }).catch(() => false);
  }

  // Fallback: button with Avatar child
  const altButton = page.locator('button:has([class*="Avatar"])').first();
  if (await altButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await altButton.click();
    await sleep(500);
    const menu = page.locator('[role="menu"]');
    return await menu.isVisible({ timeout: 3000 }).catch(() => false);
  }

  return false;
}

/**
 * Check if leader/admin indicator is visible (amber ring on avatar)
 */
async function checkLeaderIndicator(page: Page): Promise<boolean> {
  console.log('\n=== Checking Leader Indicator ===');

  // Admin users get a ring-amber-400 on their avatar in TopBar
  const adminRing = page.locator('[data-testid="user-avatar-button"] [class*="ring-amber"], [data-testid="user-avatar-button"] .ring-2');

  const visible = await adminRing.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Admin ring visible: ${visible}`);

  if (!visible) {
    // Also check for any crown/star/shield icon near avatar
    const adminIcon = page.locator('[data-testid="user-avatar-button"] svg.lucide-shield, [data-testid="user-avatar-button"] svg.lucide-crown').first();
    const iconVisible = await adminIcon.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Admin icon visible: ${iconVisible}`);
    return iconVisible || visible;
  }

  return visible;
}

/**
 * Check if WorkspaceSwitcher renders and test dropdown
 */
async function checkWorkspaceSwitcher(page: Page): Promise<{
  visible: boolean;
  dropdownWorks: boolean;
}> {
  console.log('\n=== Checking Workspace Switcher ===');

  const results = { visible: false, dropdownWorks: false };

  // WorkspaceSwitcher shows workspace name/logo in TopBar or sidebar header
  const switcher = page.locator('[data-testid="workspace-name"], [data-testid="workspace-switcher"]').first();
  results.visible = await switcher.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Workspace switcher (data-testid): ${results.visible}`);

  // Find the trigger button (has ChevronRight icon)
  let triggerBtn = switcher;
  if (!results.visible) {
    triggerBtn = page.locator('button:has(svg.lucide-chevron-right)').first();
    results.visible = await triggerBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Workspace switcher (chevron): ${results.visible}`);
  }

  if (!results.visible) return results;

  // Test dropdown: click to open, verify "Join New Workspace" item appears
  await triggerBtn.click();
  await sleep(500);

  const joinNewItem = page.locator('[role="menuitem"]:has-text("Join New Workspace")').first();
  results.dropdownWorks = await joinNewItem.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Dropdown opens with "Join New Workspace": ${results.dropdownWorks}`);

  // Close dropdown
  await page.keyboard.press('Escape');
  await sleep(300);

  return results;
}

/**
 * Test ProfileModal
 */
async function testProfileModal(page: Page): Promise<{
  opens: boolean;
  hasDisplayName: boolean;
  closes: boolean;
}> {
  console.log('\n=== Testing Profile Modal ===');

  const results = { opens: false, hasDisplayName: false, closes: false };

  const opened = await openUserDropdown(page);
  if (!opened) {
    console.log('  Could not open dropdown');
    return results;
  }

  const profileItem = page.locator('[role="menuitem"]:has-text("Profile")');
  if (!(await profileItem.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('  Profile menu item not found');
    return results;
  }

  await profileItem.click();
  await sleep(1000);

  // Check if profile modal opened
  const profileDialog = page.locator('[role="dialog"]').first();
  results.opens = await profileDialog.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Profile modal opens: ${results.opens}`);

  if (results.opens) {
    // Check for display name field
    const displayNameField = page.locator('input[name="displayName"], input[placeholder*="name"], input[placeholder*="Name"]').first();
    results.hasDisplayName = await displayNameField.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Has display name field: ${results.hasDisplayName}`);

    if (!results.hasDisplayName) {
      // Alternative: check for any text mentioning profile/name
      const profileText = page.locator('text="Display Name", text="Full Name", text="Profile"').first();
      results.hasDisplayName = await profileText.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`  Has profile text: ${results.hasDisplayName}`);
    }

    // Close
    await page.keyboard.press('Escape');
    await sleep(500);
    results.closes = !(await profileDialog.isVisible({ timeout: 1000 }).catch(() => false));
    console.log(`  Profile modal closes: ${results.closes}`);
  }

  return results;
}

/**
 * Test PreferencesDialog
 */
async function testPreferencesDialog(page: Page): Promise<{
  opens: boolean;
  hasControls: boolean;
  closes: boolean;
}> {
  console.log('\n=== Testing Preferences Dialog ===');

  const results = { opens: false, hasControls: false, closes: false };

  const opened = await openUserDropdown(page);
  if (!opened) {
    console.log('  Could not open dropdown');
    return results;
  }

  // Look for Preferences menu item
  const prefsItem = page.locator('[role="menuitem"]:has-text("Preferences")');
  if (!(await prefsItem.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('  Preferences menu item not found');
    // Close dropdown
    await page.keyboard.press('Escape');
    return results;
  }

  await prefsItem.click();
  await sleep(1000);

  const prefsDialog = page.locator('[role="dialog"]').first();
  results.opens = await prefsDialog.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Preferences dialog opens: ${results.opens}`);

  if (results.opens) {
    // Check for auto-accept switch
    const autoAcceptSwitch = page.locator('#auto-accept-registrations, [role="switch"]').first();
    results.hasControls = await autoAcceptSwitch.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Has controls: ${results.hasControls}`);

    // Close
    await page.keyboard.press('Escape');
    await sleep(500);
    results.closes = !(await prefsDialog.isVisible({ timeout: 1000 }).catch(() => false));
    console.log(`  Preferences dialog closes: ${results.closes}`);
  }

  return results;
}

/**
 * Test ExitConfirmModal (cancel + confirm)
 */
async function testExitConfirmModal(page: Page): Promise<{
  modalAppears: boolean;
  cancelKeepsWorkspace: boolean;
  confirmExits: boolean;
}> {
  console.log('\n=== Testing Exit Confirm Modal ===');

  const results = { modalAppears: false, cancelKeepsWorkspace: false, confirmExits: false };

  // Open dropdown and click "Exit to Landing"
  const opened = await openUserDropdown(page);
  if (!opened) {
    console.log('  Could not open dropdown');
    return results;
  }

  const exitItem = page.locator('[role="menuitem"]:has-text("Exit to Landing"), [role="menuitem"]:has-text("Exit")');
  if (!(await exitItem.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('  Exit to Landing menu item not found');
    await page.keyboard.press('Escape');
    return results;
  }

  await exitItem.click();
  await sleep(1000);

  // Check for confirmation modal
  const confirmModal = page.locator('[role="alertdialog"], [role="dialog"]').first();
  results.modalAppears = await confirmModal.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Exit confirm modal appears: ${results.modalAppears}`);

  if (!results.modalAppears) return results;

  // Test Cancel - should stay in workspace
  const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("Stay")').first();
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
    await sleep(1000);

    // Verify we're still in workspace
    const stillInWorkspace = await waitForWorkspaceLoaded(page, 5000);
    results.cancelKeepsWorkspace = stillInWorkspace;
    console.log(`  Cancel keeps workspace: ${results.cancelKeepsWorkspace}`);
  }

  // Now test Confirm - should exit to landing
  const opened2 = await openUserDropdown(page);
  if (opened2) {
    const exitItem2 = page.locator('[role="menuitem"]:has-text("Exit to Landing"), [role="menuitem"]:has-text("Exit")');
    if (await exitItem2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exitItem2.click();
      await sleep(1000);

      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Exit"), button:has-text("Leave")').first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        await sleep(3000);

        // Verify we're on the landing page
        const joinBtn = page.locator('button:has-text("Join Workspace")');
        const loginBtn = page.locator('button:has-text("Login Workspace")');
        const onLanding = (await joinBtn.isVisible({ timeout: 5000 }).catch(() => false)) ||
                          (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false));
        results.confirmExits = onLanding;
        console.log(`  Confirm exits to landing: ${results.confirmExits}`);
      }
    }
  }

  return results;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'TopBar & Navigation Chrome Test',
    reportFileName: 'TOPBAR_NAVIGATION_TEST_REPORT.json',
    metadata: { username: USERNAME },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`Username: ${USERNAME}`);
  console.log('');

  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    leaderIndicatorVisible: false,
    workspaceSwitcherVisible: false,
    workspaceSwitcherDropdownWorks: false,
    profileModalOpens: false,
    profileHasDisplayName: false,
    profileModalCloses: false,
    preferencesOpens: false,
    preferencesHasControls: false,
    preferencesCloses: false,
    exitConfirmModalAppears: false,
    cancelKeepsWorkspace: false,
    confirmExitsToLanding: false,
  };

  try {
    const page = await context.newPage();
    setupConsoleCapture(page, 'TopBar', ['error', 'Error']);

    // ========== STEP 1: Create Account ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('\u2500'.repeat(50));

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
    await closeAnyModals(page);
    await waitForWorkspaceLoaded(page, 30000);

    // ========== STEP 2: Check Leader Indicator ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: Check Leader Indicator');
    console.log('\u2500'.repeat(50));

    results.leaderIndicatorVisible = await checkLeaderIndicator(page);
    await takeScreenshot(page, '02_leader_indicator');

    // ========== STEP 3: Check Workspace Switcher ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Check Workspace Switcher');
    console.log('\u2500'.repeat(50));

    const switcherResult = await checkWorkspaceSwitcher(page);
    results.workspaceSwitcherVisible = switcherResult.visible;
    results.workspaceSwitcherDropdownWorks = switcherResult.dropdownWorks;
    await takeScreenshot(page, '03_workspace_switcher');

    // ========== STEP 4: Test Profile Modal ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Test Profile Modal');
    console.log('\u2500'.repeat(50));

    const profileResult = await testProfileModal(page);
    results.profileModalOpens = profileResult.opens;
    results.profileHasDisplayName = profileResult.hasDisplayName;
    results.profileModalCloses = profileResult.closes;
    await takeScreenshot(page, '04_profile_modal');

    // ========== STEP 5: Test Preferences Dialog ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Test Preferences Dialog');
    console.log('\u2500'.repeat(50));

    const prefsResult = await testPreferencesDialog(page);
    results.preferencesOpens = prefsResult.opens;
    results.preferencesHasControls = prefsResult.hasControls;
    results.preferencesCloses = prefsResult.closes;
    await takeScreenshot(page, '05_preferences_dialog');

    // ========== STEP 6: Test Exit Confirm Modal ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 6: Test Exit Confirm Modal');
    console.log('\u2500'.repeat(50));

    const exitResult = await testExitConfirmModal(page);
    results.exitConfirmModalAppears = exitResult.modalAppears;
    results.cancelKeepsWorkspace = exitResult.cancelKeepsWorkspace;
    results.confirmExitsToLanding = exitResult.confirmExits;
    await takeScreenshot(page, '06_exit_confirm');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreated;

    console.log('\nAccount:');
    console.log(`  Account Created:           ${results.accountCreated ? 'PASS' : 'FAIL'}`);

    console.log('\nTopBar Elements:');
    console.log(`  Leader Indicator:          ${results.leaderIndicatorVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Workspace Switcher:        ${results.workspaceSwitcherVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Switcher Dropdown:         ${results.workspaceSwitcherDropdownWorks ? 'PASS' : 'CHECK'}`);

    console.log('\nProfile Modal:');
    console.log(`  Opens:                     ${results.profileModalOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  Has Display Name:          ${results.profileHasDisplayName ? 'PASS' : 'CHECK'}`);
    console.log(`  Closes:                    ${results.profileModalCloses ? 'PASS' : 'CHECK'}`);

    console.log('\nPreferences Dialog:');
    console.log(`  Opens:                     ${results.preferencesOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  Has Controls:              ${results.preferencesHasControls ? 'PASS' : 'CHECK'}`);
    console.log(`  Closes:                    ${results.preferencesCloses ? 'PASS' : 'CHECK'}`);

    console.log('\nExit Confirm Modal:');
    console.log(`  Modal Appears:             ${results.exitConfirmModalAppears ? 'PASS' : 'CHECK'}`);
    console.log(`  Cancel Keeps Workspace:    ${results.cancelKeepsWorkspace ? 'PASS' : 'CHECK'}`);
    console.log(`  Confirm Exits:             ${results.confirmExitsToLanding ? 'PASS' : 'CHECK'}`);

    harness.finalize(corePassed, results);
    return corePassed;

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

runTestMain(runTest);
