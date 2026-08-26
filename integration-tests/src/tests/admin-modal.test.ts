import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  createAccount,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  closeAnyModals,
  logObservation,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { config } from '../lib/config.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  // Step 0: Account setup
  accountCreated: boolean;
  workspaceLoaded: boolean;

  // Step 1: Create office for testing
  officeCreated: boolean;
  officeVisibleInSidebar: boolean;

  // Step 2: Context menu access
  contextMenuOpens: boolean;
  adminSettingsVisible: boolean;

  // Step 3: Admin modal structure
  adminModalOpens: boolean;
  threeTabsExist: boolean;
  generalTabExists: boolean;
  membersTabExists: boolean;
  chatTabExists: boolean;

  // Step 4: General tab functionality
  generalTabActive: boolean;
  nameFieldVisible: boolean;
  descriptionFieldVisible: boolean;
  saveButtonVisible: boolean;

  // Step 5: Members tab navigation
  membersTabActive: boolean;
  memberListVisible: boolean;
  advancedToggleVisible: boolean;

  // Step 6: Chat settings tab navigation
  chatTabActive: boolean;
  chatTabContentCorrect: boolean;
  /**
   * Left undefined — and so excluded from the verdict, like the optional room
   * fields — when the entity is workspace-level, where chat settings have no
   * backend to persist to.
   */
  chatSettingsPersist?: boolean;

  // Step 7: Room admin modal (only tested when rooms exist in sidebar)
  roomCreated?: boolean;
  roomAdminModalOpens?: boolean;
  roomGeneralTabWorks?: boolean;
}

// ============================================================================
// Test Constants
// ============================================================================

const USERNAME = `admin_modal_test_${Date.now()}`;
const PASSWORD = config.DEFAULT_PASSWORD;
const TEST_OFFICE_NAME = 'Test Admin Office';

// ============================================================================
// Helper Functions
// ============================================================================

function getAdminDialog(page: Page) {
  return page.locator('[role="dialog"][data-testid="admin-modal"]');
}

async function openNodeContextMenu(page: Page, _nodeName: string): Promise<boolean> {
  const nodeItem = page.locator(`[data-testid^="tree-node-menu-"]`).first();
  try {
    await nodeItem.click({ force: true, timeout: 5000 });
    await sleep(300);
    const menu = page.locator('[role="menu"]');
    return await isVisibleWithin(menu, 3000);
  } catch {
    return false;
  }
}

/** @deprecated Use openNodeContextMenu instead */
const openOfficeContextMenu = openNodeContextMenu;

async function clickAdminSettingsMenuItem(page: Page): Promise<boolean> {
  try {
    const menuItem = page.locator('[data-testid^="admin-settings-node-"]').first();
    if (await isVisibleWithin(menuItem, 3000)) {
      await menuItem.click();
      await sleep(500);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function navigateToTab(page: Page, tabName: 'general' | 'members' | 'chat'): Promise<boolean> {
  const dialog = getAdminDialog(page);
  try {
    const tab = dialog.locator(`[data-testid="admin-tab-${tabName}"]`);
    if (await isVisibleWithin(tab, 3000)) {
      await tab.click();
      await sleep(300);
      const content = dialog.locator(`[data-testid="admin-content-${tabName}"]`);
      return await isVisibleWithin(content, 2000);
    }
    return false;
  } catch {
    return false;
  }
}

async function countTabs(page: Page): Promise<number> {
  const dialog = getAdminDialog(page);
  try {
    const tabs = dialog.locator('[role="tablist"] button[role="tab"]');
    return await tabs.count();
  } catch {
    return 0;
  }
}

async function openRoomContextMenu(page: Page): Promise<boolean> {
  // Find a child node menu button (second tree-node-menu if multiple exist)
  const allMenuBtns = page.locator('[data-testid^="tree-node-menu-"]');
  const count = await allMenuBtns.count();
  if (count < 2) return false;
  try {
    await allMenuBtns.nth(1).click({ force: true, timeout: 5000 });
    await sleep(300);
    const menu = page.locator('[role="menu"]');
    return await isVisibleWithin(menu, 3000);
  } catch {
    return false;
  }
}

async function clickRoomAdminSettings(page: Page): Promise<boolean> {
  try {
    const menuItem = page.locator('[data-testid^="admin-settings-node-"]').first();
    if (await isVisibleWithin(menuItem, 3000)) {
      await menuItem.click();
      await sleep(500);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Admin Modal Integration Test',
    reportFileName: 'ADMIN_MODAL_TEST_REPORT.json',
    restartBackend: true,
    metadata: { username: USERNAME },
  });
  const uxTracker = harness.uxTracker;

  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    workspaceLoaded: false,
    officeCreated: false,
    officeVisibleInSidebar: false,
    contextMenuOpens: false,
    adminSettingsVisible: false,
    adminModalOpens: false,
    threeTabsExist: false,
    generalTabExists: false,
    membersTabExists: false,
    chatTabExists: false,
    generalTabActive: false,
    nameFieldVisible: false,
    descriptionFieldVisible: false,
    saveButtonVisible: false,
    membersTabActive: false,
    memberListVisible: false,
    advancedToggleVisible: false,
    chatTabActive: false,
    chatTabContentCorrect: false,
    chatSettingsPersist: undefined,
  };

  try {
    const page = await context.newPage();
    setupConsoleCapture(page, 'AdminModalTest', ['error', 'Error', 'ILM']);

    // ========================================================================
    // Step 0: Create Account and Login
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 0: Create Account and Login');
    console.log('─'.repeat(50));

    const accountCreated = await createAccount(page, USERNAME, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });
    results.accountCreated = accountCreated;
    logObservation('AdminModalTest', 'Account creation', { created: accountCreated });

    if (!accountCreated) {
      console.error('  Failed to create account');
      return false;
    }

    await takeScreenshot(page, 'admin_00_account_created');

    results.workspaceLoaded = await waitForWorkspaceLoaded(page, 60000);
    logObservation('AdminModalTest', 'Workspace loading', { loaded: results.workspaceLoaded });

    if (!results.workspaceLoaded) {
      console.error('  Failed to load workspace');
      return false;
    }

    await closeAnyModals(page);
    await takeScreenshot(page, 'admin_01_workspace_loaded');

    // ========================================================================
    // Step 1: Create an Office for Testing
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create an Office for Testing');
    console.log('─'.repeat(50));

    await sleep(1000);

    // Click the "+" button in the HIERARCHY section to create a new node
    const addNodeBtn = page.locator('[data-testid="add-node-button"], [data-testid="add-root-node-button"]').first();
    if (await isVisibleWithin(addNodeBtn, 5000)) {
      await addNodeBtn.click();
      await sleep(500);

      // Fill the NodeManagementModal
      const nameInput = page.locator('input#name, input[id="name"]').first();
      if (await isVisibleWithin(nameInput, 3000)) {
        await nameInput.fill(TEST_OFFICE_NAME);
        await sleep(200);

        // Click the submit/create button
        const submitBtn = page.locator('button[type="submit"], button:has-text("Create")').first();
        if (await isVisibleWithin(submitBtn, 2000)) {
          await submitBtn.click();
          await sleep(2000);
        }
      }
    }

    // Dismiss any toasts/overlays
    await page.keyboard.press('Escape');
    await sleep(500);

    // Verify office appears in sidebar
    const nodeMenuButton = page.locator('[data-testid^="tree-node-menu-"]').first();
    results.officeCreated = await isVisibleWithin(nodeMenuButton, 10000);
    console.log(`  Office created: ${results.officeCreated ? 'PASS' : 'FAIL'}`);
    await takeScreenshot(page, 'admin_02_office_created');

    results.officeVisibleInSidebar = results.officeCreated;
    console.log(`  Office visible in sidebar: ${results.officeVisibleInSidebar ? 'PASS' : 'FAIL'}`);

    await closeAnyModals(page);

    // ========================================================================
    // Step 2: Open Context Menu and Find Admin Settings
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Open Context Menu and Find Admin Settings');
    console.log('─'.repeat(50));

    results.contextMenuOpens = await openOfficeContextMenu(page, TEST_OFFICE_NAME);
    console.log(`  Context menu opens: ${results.contextMenuOpens ? 'PASS' : 'FAIL'}`);
    await takeScreenshot(page, 'admin_03_context_menu');

    if (results.contextMenuOpens) {
      const adminMenuItem = page.locator('[data-testid^="admin-settings-node-"]').first();
      results.adminSettingsVisible = await isVisibleWithin(adminMenuItem, 3000);
      console.log(`  Admin Settings visible: ${results.adminSettingsVisible ? 'PASS' : 'FAIL'}`);
    }

    // ========================================================================
    // Step 3: Open Admin Modal and Verify Structure
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Open Admin Modal and Verify Structure');
    console.log('─'.repeat(50));

    if (results.adminSettingsVisible) {
      await clickAdminSettingsMenuItem(page);
      await sleep(500);

      const dialog = getAdminDialog(page);
      results.adminModalOpens = await isVisibleWithin(dialog, 5000);
      console.log(`  Admin modal opens: ${results.adminModalOpens ? 'PASS' : 'FAIL'}`);
      await takeScreenshot(page, 'admin_04_modal_opened');

      if (results.adminModalOpens) {
        const tabCount = await countTabs(page);
        results.threeTabsExist = tabCount === 3;
        console.log(`  Tab count: ${tabCount} (expected: 3) - ${results.threeTabsExist ? 'PASS' : 'FAIL'}`);

        results.generalTabExists = await dialog.locator('[data-testid="admin-tab-general"]').isVisible().catch(() => false);
        results.membersTabExists = await dialog.locator('[data-testid="admin-tab-members"]').isVisible().catch(() => false);
        results.chatTabExists = await dialog.locator('[data-testid="admin-tab-chat"]').isVisible().catch(() => false);

        console.log(`  General tab exists: ${results.generalTabExists ? 'PASS' : 'FAIL'}`);
        console.log(`  Members tab exists: ${results.membersTabExists ? 'PASS' : 'FAIL'}`);
        console.log(`  Chat tab exists: ${results.chatTabExists ? 'PASS' : 'FAIL'}`);
      }
    }

    // ========================================================================
    // Step 4: Test General Tab Functionality
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Test General Tab Functionality');
    console.log('─'.repeat(50));

    if (results.adminModalOpens) {
      results.generalTabActive = await navigateToTab(page, 'general');
      console.log(`  General tab active: ${results.generalTabActive ? 'PASS' : 'FAIL'}`);
      await takeScreenshot(page, 'admin_05_general_tab');

      const dialog = getAdminDialog(page);
      results.nameFieldVisible = await dialog.locator('[data-testid="general-name-input"]').isVisible().catch(() => false);
      results.descriptionFieldVisible = await dialog.locator('[data-testid="general-description-input"]').isVisible().catch(() => false);
      results.saveButtonVisible = await dialog.locator('[data-testid="general-save-button"]').isVisible().catch(() => false);

      console.log(`  Name field visible: ${results.nameFieldVisible ? 'PASS' : 'FAIL'}`);
      console.log(`  Description field visible: ${results.descriptionFieldVisible ? 'PASS' : 'FAIL'}`);
      console.log(`  Save button visible: ${results.saveButtonVisible ? 'PASS' : 'FAIL'}`);
    }

    // ========================================================================
    // Step 5: Test Members Tab Navigation
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Test Members Tab Navigation');
    console.log('─'.repeat(50));

    if (results.adminModalOpens) {
      results.membersTabActive = await navigateToTab(page, 'members');
      console.log(`  Members tab active: ${results.membersTabActive ? 'PASS' : 'FAIL'}`);
      await takeScreenshot(page, 'admin_06_members_tab');

      const dialog = getAdminDialog(page);
      results.memberListVisible = await dialog.locator('[data-testid="members-tab-content"]').isVisible().catch(() => false);
      results.advancedToggleVisible = await dialog.locator('[data-testid="members-advanced-toggle"]').isVisible().catch(() => false);

      console.log(`  Member list visible: ${results.memberListVisible ? 'PASS' : 'FAIL'}`);
      console.log(`  Advanced toggle visible: ${results.advancedToggleVisible ? 'PASS' : 'FAIL'}`);
    }

    // ========================================================================
    // Step 6: Test Chat Settings Tab Navigation
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Test Chat Settings Tab Navigation');
    console.log('─'.repeat(50));

    if (results.adminModalOpens) {
      results.chatTabActive = await navigateToTab(page, 'chat');
      console.log(`  Chat tab active: ${results.chatTabActive ? 'PASS' : 'FAIL'}`);
      await takeScreenshot(page, 'admin_07_chat_tab');

      const dialog = getAdminDialog(page);

      // ChatSettingsTab renders differently based on entityType:
      //   - workspace entities → info message (no toggle), data-testid="chat-tab-workspace-message"
      //   - non-workspace entities → toggle + settings, data-testid="chat-tab-content"
      // The entity type depends on the node created — if it's a workspace-level node,
      // the workspace message is the CORRECT behavior.
      const isWorkspaceMsg = await dialog.locator('[data-testid="chat-tab-workspace-message"]').isVisible().catch(() => false);
      if (isWorkspaceMsg) {
        // Workspace entities correctly show info message instead of toggle
        console.log('  Chat tab shows workspace message (correct for workspace entities)');
        results.chatTabContentCorrect = true;
      } else {
        // Non-workspace: wait for the chat toggle to appear
        try {
          await dialog.locator('[data-testid="chat-enabled-toggle"]').waitFor({ state: 'visible', timeout: 5000 });
          results.chatTabContentCorrect = true;
        } catch {
          results.chatTabContentCorrect = false;
        }
      }

      console.log(`  Chat tab content correct: ${results.chatTabContentCorrect ? 'PASS' : 'FAIL'}`);

      // Save-and-reopen round trip. This is the assertion that distinguishes a
      // real save from a success toast: ChatSettingsTab used to persist nothing
      // and report success anyway, and every check above still passed.
      if (!isWorkspaceMsg && results.chatTabContentCorrect) {
        const toggle = dialog.locator('[data-testid="chat-enabled-toggle"]');
        const before = await toggle.getAttribute('data-state');
        await toggle.click();
        const after = await toggle.getAttribute('data-state');

        if (before === after) {
          console.log('  Chat toggle did not change state - cannot test persistence');
          results.chatSettingsPersist = false;
        } else {
          await dialog.locator('[data-testid="chat-save-button"]').click();
          await sleep(1500);
          await page.keyboard.press('Escape');
          await sleep(500);

          await clickAdminSettingsMenuItem(page);
          await sleep(500);
          const reopened = await navigateToTab(page, 'chat');
          if (!reopened) {
            console.log('  Could not reopen chat tab to verify persistence');
            results.chatSettingsPersist = false;
          } else {
            const persisted = await getAdminDialog(page)
              .locator('[data-testid="chat-enabled-toggle"]')
              .getAttribute('data-state');
            results.chatSettingsPersist = persisted === after;
            console.log(`  Chat setting persisted: ${after} -> reopened as ${persisted}`);
          }
          await takeScreenshot(page, 'admin_08_chat_persistence');
        }
        console.log(`  Chat settings persist: ${results.chatSettingsPersist ? 'PASS' : 'FAIL'}`);
      } else if (isWorkspaceMsg) {
        console.log('  Chat settings persist: SKIP (workspace level has no chat backend)');
      }

      // Close the modal
      await page.keyboard.press('Escape');
      await sleep(500);
    }

    // ========================================================================
    // Step 7: Test Room Admin Modal (if rooms exist)
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Test Room Admin Modal');
    console.log('─'.repeat(50));

    // Check if any room menu buttons exist (rooms are visible in sidebar when office is selected)
    // Use a short timeout to avoid hanging
    // Check if any child nodes exist (rooms) — look for 2nd tree-node-menu
    const allMenuBtns = page.locator('[data-testid^="tree-node-menu-"]');
    const menuBtnCount = await allMenuBtns.count();
    const roomExists = menuBtnCount >= 2;

    if (roomExists) {
      console.log('  Room found in sidebar');
      results.roomCreated = true;

      // Try to open room context menu
      const roomMenuOpened = await openRoomContextMenu(page);
      console.log(`  Room context menu opened: ${roomMenuOpened ? 'PASS' : 'FAIL'}`);

      if (roomMenuOpened) {
        await clickRoomAdminSettings(page);
        await sleep(500);

        const dialog = getAdminDialog(page);
        results.roomAdminModalOpens = await isVisibleWithin(dialog, 3000);
        console.log(`  Room admin modal opens: ${results.roomAdminModalOpens ? 'PASS' : 'FAIL'}`);
        await takeScreenshot(page, 'admin_08_room_admin_modal');

        if (results.roomAdminModalOpens) {
          results.roomGeneralTabWorks = await navigateToTab(page, 'general');
          console.log(`  Room general tab works: ${results.roomGeneralTabWorks ? 'PASS' : 'FAIL'}`);
        } else {
          results.roomGeneralTabWorks = false;
        }
      } else {
        results.roomAdminModalOpens = false;
        results.roomGeneralTabWorks = false;
      }
    } else {
      // No rooms visible — room admin tests excluded from pass/fail count
      console.log('  No rooms visible in sidebar — room admin tests skipped');
      console.log('  (Room results excluded from pass/fail count)');
    }

    await takeScreenshot(page, 'admin_09_rooms_final');

    // ========================================================================
    // Final Results
    // ========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    // Only count defined results (optional room fields excluded when no rooms exist)
    const definedEntries = Object.entries(results).filter(([, v]) => v !== undefined);
    const passCount = definedEntries.filter(([, v]) => v === true).length;
    const totalCount = definedEntries.length;
    const allPassed = passCount === totalCount;

    console.log(`\nPassed: ${passCount}/${totalCount}`);
    console.log(`Status: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

    for (const [key, value] of definedEntries) {
      const status = value ? '✓' : '✗';
      console.log(`  ${status} ${key}: ${value ? 'PASS' : 'FAIL'}`);
    }

    await takeScreenshot(page, 'admin_10_final');

    await harness.finalize(allPassed, results as unknown as Record<string, any>);

    await sleep(3000);
    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    return false;
  } finally {
    await browser.close();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
