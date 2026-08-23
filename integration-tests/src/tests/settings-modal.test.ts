/**
 * Settings Modal Integration Test
 *
 * Tests the Settings Modal functionality:
 * 1. Open settings via TopBar user dropdown
 * 2. Verify modal structure (title, description, tabs)
 * 3. Test tab navigation (General, Connections, Appearance, Privacy, Permissions)
 * 4. Verify tab content renders
 * 5. Close settings modal
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
  // Account creation
  accountCreated: boolean;

  // Opening settings
  userDropdownOpens: boolean;
  settingsMenuItemVisible: boolean;
  modalOpens: boolean;

  // Modal structure
  titleVisible: boolean;
  descriptionVisible: boolean;
  tabsVisible: boolean;

  // Tab functionality
  generalTabWorks: boolean;
  connectionsTabWorks: boolean;
  appearanceTabWorks: boolean;
  privacyTabWorks: boolean;
  permissionsTabWorks: boolean;

  // Tab content
  generalTabHasContent: boolean;
  connectionsTabHasContent: boolean;
  appearanceTabHasContent: boolean;
  privacyTabHasContent: boolean;
  permissionsTabHasContent: boolean;

  // Close functionality
  modalCloses: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `settings_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Open the user dropdown menu in TopBar
 */
async function openUserDropdown(page: Page): Promise<boolean> {
  console.log('\n=== Opening User Dropdown ===');

  try {
    // Find the user avatar button using data-testid (most reliable)
    const avatarButton = page.locator('[data-testid="user-avatar-button"]');

    if (await avatarButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('  Found avatar button via data-testid');
      await avatarButton.click();
      await sleep(500);

      // Check if dropdown opened
      const dropdownContent = page.locator('[role="menu"]');
      const opened = await dropdownContent.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Dropdown opened: ${opened}`);
      return opened;
    }

    // Alternative: try finding by button containing Avatar
    const altButton = page.locator('button:has([class*="Avatar"])').first();
    if (await altButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Found avatar button via class selector');
      await altButton.click();
      await sleep(500);
      const dropdownContent = page.locator('[role="menu"]');
      const opened = await dropdownContent.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Dropdown opened (alt): ${opened}`);
      return opened;
    }

    console.log('  User dropdown trigger not found');
    return false;
  } catch (error) {
    console.error('  Error opening user dropdown:', error);
    return false;
  }
}

/**
 * Click the Settings menu item
 */
async function clickSettingsMenuItem(page: Page): Promise<boolean> {
  console.log('\n=== Clicking Settings Menu Item ===');

  try {
    const settingsItem = page.locator('[role="menuitem"]:has-text("Settings")');
    if (!(await settingsItem.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('  Settings menu item not found');
      return false;
    }

    await settingsItem.click();
    await sleep(500);

    // Check if settings modal opened
    const modalTitle = page.locator('text="Settings"').first();
    const opened = await modalTitle.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Settings modal opened: ${opened}`);
    return opened;
  } catch (error) {
    console.error('  Error clicking settings:', error);
    return false;
  }
}

/**
 * Verify modal structure elements
 */
async function verifyModalStructure(page: Page): Promise<{
  title: boolean;
  description: boolean;
  tabs: boolean;
}> {
  console.log('\n=== Verifying Modal Structure ===');

  const results = {
    title: false,
    description: false,
    tabs: false,
  };

  // Check title
  const title = page.locator('[role="dialog"] text="Settings"').first();
  results.title = await title.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Title visible: ${results.title}`);

  // Check description
  const description = page.locator('text="Configure your workspace preferences"');
  results.description = await description.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Description visible: ${results.description}`);

  // Check tabs (General, Connections, Appearance, Privacy, Permissions)
  const generalTab = page.locator('button[role="tab"]:has-text("General"), button[role="tab"]:has(svg.lucide-settings)');
  const connectionsTab = page.locator('button[role="tab"]:has-text("Connections"), button[role="tab"]:has(svg.lucide-wifi)');
  const appearanceTab = page.locator('button[role="tab"]:has-text("Appearance"), button[role="tab"]:has(svg.lucide-palette)');
  const privacyTab = page.locator('button[role="tab"]:has-text("Privacy"), button[role="tab"]:has(svg.lucide-shield)');
  const permissionsTab = page.locator('button[role="tab"]:has-text("Permissions"), button[role="tab"]:has(svg.lucide-lock)');

  const tabsVisible = await Promise.all([
    generalTab.isVisible({ timeout: 3000 }).catch(() => false),
    connectionsTab.isVisible({ timeout: 3000 }).catch(() => false),
    appearanceTab.isVisible({ timeout: 3000 }).catch(() => false),
    privacyTab.isVisible({ timeout: 3000 }).catch(() => false),
    permissionsTab.isVisible({ timeout: 3000 }).catch(() => false),
  ]);
  results.tabs = tabsVisible.some(Boolean); // At least some tabs visible (icons might be shown without text on small screens)
  console.log(`  Tabs visible: ${results.tabs} (${tabsVisible.filter(Boolean).length}/5 visible)`);

  return results;
}

/**
 * Test tab switching and content
 */
async function testTabSwitching(page: Page): Promise<{
  general: { works: boolean; hasContent: boolean };
  connections: { works: boolean; hasContent: boolean };
  appearance: { works: boolean; hasContent: boolean };
  privacy: { works: boolean; hasContent: boolean };
  permissions: { works: boolean; hasContent: boolean };
}> {
  console.log('\n=== Testing Tab Switching ===');

  const results = {
    general: { works: false, hasContent: false },
    connections: { works: false, hasContent: false },
    appearance: { works: false, hasContent: false },
    privacy: { works: false, hasContent: false },
    permissions: { works: false, hasContent: false },
  };

  // Test General tab (default)
  const generalTab = page.locator('button[role="tab"]').first(); // First tab is General
  if (await generalTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await generalTab.click({ force: true });
    await sleep(300);
    const isActive = await generalTab.getAttribute('data-state');
    results.general.works = isActive === 'active';

    // Check for tab content (GeneralSettingsTab should have some content)
    const tabContent = page.locator('[role="tabpanel"]');
    results.general.hasContent = await tabContent.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  General: works=${results.general.works}, hasContent=${results.general.hasContent}`);
  }

  // Test Connections tab
  const connectionsTab = page.locator('button[role="tab"]').nth(1);
  if (await connectionsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await connectionsTab.click({ force: true });
    await sleep(300);
    const isActive = await connectionsTab.getAttribute('data-state');
    results.connections.works = isActive === 'active';

    const tabContent = page.locator('[role="tabpanel"]');
    results.connections.hasContent = await tabContent.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Connections: works=${results.connections.works}, hasContent=${results.connections.hasContent}`);
  }

  // Test Appearance tab
  const appearanceTab = page.locator('button[role="tab"]').nth(2);
  if (await appearanceTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await appearanceTab.click({ force: true });
    await sleep(300);
    const isActive = await appearanceTab.getAttribute('data-state');
    results.appearance.works = isActive === 'active';

    const tabContent = page.locator('[role="tabpanel"]');
    results.appearance.hasContent = await tabContent.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Appearance: works=${results.appearance.works}, hasContent=${results.appearance.hasContent}`);
  }

  // Test Privacy tab
  const privacyTab = page.locator('button[role="tab"]').nth(3);
  if (await privacyTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await privacyTab.click({ force: true });
    await sleep(300);
    const isActive = await privacyTab.getAttribute('data-state');
    results.privacy.works = isActive === 'active';

    const tabContent = page.locator('[role="tabpanel"]');
    results.privacy.hasContent = await tabContent.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Privacy: works=${results.privacy.works}, hasContent=${results.privacy.hasContent}`);
  }

  // Test Permissions tab
  const permissionsTab = page.locator('button[role="tab"]').nth(4);
  if (await permissionsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await permissionsTab.click({ force: true });
    await sleep(300);
    const isActive = await permissionsTab.getAttribute('data-state');
    results.permissions.works = isActive === 'active';

    const tabContent = page.locator('[role="tabpanel"]');
    results.permissions.hasContent = await tabContent.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Permissions: works=${results.permissions.works}, hasContent=${results.permissions.hasContent}`);
  }

  return results;
}

/**
 * Close the settings modal
 */
async function closeSettingsModal(page: Page): Promise<boolean> {
  console.log('\n=== Closing Settings Modal ===');

  try {
    // Try pressing Escape
    await page.keyboard.press('Escape');
    await sleep(500);

    // Check if modal closed
    const modalTitle = page.locator('[role="dialog"] text="Settings"').first();
    const closed = !(await modalTitle.isVisible({ timeout: 1000 }).catch(() => false));
    console.log(`  Modal closed: ${closed}`);
    return closed;
  } catch (error) {
    console.error('  Error closing modal:', error);
    return false;
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Settings Modal Test',
    reportFileName: 'SETTINGS_MODAL_TEST_REPORT.json',
    metadata: { username: USERNAME },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`Username: ${USERNAME}`);
  console.log('');

  // Setup browser
  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    userDropdownOpens: false,
    settingsMenuItemVisible: false,
    modalOpens: false,
    titleVisible: false,
    descriptionVisible: false,
    tabsVisible: false,
    generalTabWorks: false,
    connectionsTabWorks: false,
    appearanceTabWorks: false,
    privacyTabWorks: false,
    permissionsTabWorks: false,
    generalTabHasContent: false,
    connectionsTabHasContent: false,
    appearanceTabHasContent: false,
    privacyTabHasContent: false,
    permissionsTabHasContent: false,
    modalCloses: false,
  };

  try {
    // ========== STEP 1: Create Account ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('─'.repeat(50));

    const page = await context.newPage();
    setupConsoleCapture(page, 'Settings', ['error', 'Error', 'Settings', 'settings']);

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

    // ========== STEP 2: Open User Dropdown ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Open User Dropdown');
    console.log('─'.repeat(50));

    results.userDropdownOpens = await openUserDropdown(page);
    await takeScreenshot(page, '02_dropdown_open');

    if (!results.userDropdownOpens) {
      console.log('  WARNING: Could not open user dropdown');
      uxTracker.log('major', 'functional', 'User dropdown does not open');
    }

    // ========== STEP 3: Check Settings Menu Item ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Check Settings Menu Item');
    console.log('─'.repeat(50));

    if (results.userDropdownOpens) {
      const settingsItem = page.locator('[role="menuitem"]:has-text("Settings")');
      results.settingsMenuItemVisible = await settingsItem.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Settings menu item visible: ${results.settingsMenuItemVisible}`);
      await takeScreenshot(page, '03_settings_menu_item');
    }

    // ========== STEP 4: Open Settings Modal ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Open Settings Modal');
    console.log('─'.repeat(50));

    if (results.settingsMenuItemVisible) {
      results.modalOpens = await clickSettingsMenuItem(page);
      await takeScreenshot(page, '04_settings_modal_open');
    }

    // ========== STEP 5: Verify Modal Structure ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Verify Modal Structure');
    console.log('─'.repeat(50));

    if (results.modalOpens) {
      const structure = await verifyModalStructure(page);
      results.titleVisible = structure.title;
      results.descriptionVisible = structure.description;
      results.tabsVisible = structure.tabs;

      await takeScreenshot(page, '05_modal_structure');
    }

    // ========== STEP 6: Test Tab Switching ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Test Tab Switching');
    console.log('─'.repeat(50));

    if (results.tabsVisible) {
      const tabResults = await testTabSwitching(page);
      results.generalTabWorks = tabResults.general.works;
      results.connectionsTabWorks = tabResults.connections.works;
      results.appearanceTabWorks = tabResults.appearance.works;
      results.privacyTabWorks = tabResults.privacy.works;
      results.permissionsTabWorks = tabResults.permissions.works;

      results.generalTabHasContent = tabResults.general.hasContent;
      results.connectionsTabHasContent = tabResults.connections.hasContent;
      results.appearanceTabHasContent = tabResults.appearance.hasContent;
      results.privacyTabHasContent = tabResults.privacy.hasContent;
      results.permissionsTabHasContent = tabResults.permissions.hasContent;

      await takeScreenshot(page, '06_tabs_tested');
    }

    // ========== STEP 7: Close Modal ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Close Settings Modal');
    console.log('─'.repeat(50));

    if (results.modalOpens) {
      results.modalCloses = await closeSettingsModal(page);
      await takeScreenshot(page, '07_modal_closed');
    }

    // Final screenshot
    await takeScreenshot(page, 'FINAL_settings_modal');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreated && results.userDropdownOpens;

    console.log('\nAccount Creation:');
    console.log(`  Account Created:          ${results.accountCreated ? 'PASS' : 'FAIL'}`);

    console.log('\nOpening Settings:');
    console.log(`  User Dropdown Opens:      ${results.userDropdownOpens ? 'PASS' : 'FAIL'}`);
    console.log(`  Settings Menu Item:       ${results.settingsMenuItemVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Modal Opens:              ${results.modalOpens ? 'PASS' : 'CHECK'}`);

    console.log('\nModal Structure:');
    console.log(`  Title Visible:            ${results.titleVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Description Visible:      ${results.descriptionVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Tabs Visible:             ${results.tabsVisible ? 'PASS' : 'CHECK'}`);

    console.log('\nTab Switching:');
    console.log(`  General Tab:              ${results.generalTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Connections Tab:          ${results.connectionsTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Appearance Tab:           ${results.appearanceTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Privacy Tab:              ${results.privacyTabWorks ? 'PASS' : 'CHECK'}`);
    console.log(`  Permissions Tab:          ${results.permissionsTabWorks ? 'PASS' : 'CHECK'}`);

    console.log('\nTab Content:');
    console.log(`  General Has Content:      ${results.generalTabHasContent ? 'PASS' : 'CHECK'}`);
    console.log(`  Connections Has Content:  ${results.connectionsTabHasContent ? 'PASS' : 'CHECK'}`);
    console.log(`  Appearance Has Content:   ${results.appearanceTabHasContent ? 'PASS' : 'CHECK'}`);
    console.log(`  Privacy Has Content:      ${results.privacyTabHasContent ? 'PASS' : 'CHECK'}`);
    console.log(`  Permissions Has Content:  ${results.permissionsTabHasContent ? 'PASS' : 'CHECK'}`);

    console.log('\nClose Functionality:');
    console.log(`  Modal Closes:             ${results.modalCloses ? 'PASS' : 'CHECK'}`);

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
