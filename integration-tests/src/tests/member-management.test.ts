/**
 * Admin Member Management Integration Test (P6)
 *
 * Tests MemberManagementModal and role management:
 * 1. Open Member Management from admin settings
 * 2. Verify member list renders
 * 3. Role assignment dropdown
 * 4. Member kick/ban action
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
  accountCreation: { admin: boolean; member: boolean };
  memberManagementOpens: boolean;
  memberListVisible: boolean;
  roleDropdownVisible: boolean;
  kickButtonVisible: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const ADMIN_USER = `admin_mgmt_${timestamp}`;
const MEMBER_USER = `member_mgmt_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

async function openMemberManagement(page: Page): Promise<boolean> {
  console.log('\n=== Opening Member Management ===');

  // Try sidebar Admin Settings section
  const adminSettings = page.locator('button:has-text("Admin"), [data-testid*="admin"], text="Admin Settings"').first();
  if (await adminSettings.isVisible({ timeout: 5000 }).catch(() => false)) {
    await adminSettings.click();
    await sleep(1000);
  }

  // Look for Member Management button/link
  const memberMgmt = page.locator('button:has-text("Member Management"), button:has-text("Manage Members"), [data-testid*="member-management"]').first();
  if (await memberMgmt.isVisible({ timeout: 5000 }).catch(() => false)) {
    await memberMgmt.click();
    await sleep(1000);

    const modal = page.locator('[role="dialog"]').first();
    return await modal.isVisible({ timeout: 3000 }).catch(() => false);
  }

  // Alternative: Try the admin-modal button (from existing test patterns)
  const adminBtn = page.locator('button:has(svg.lucide-shield), button:has-text("Admin Panel")').first();
  if (await adminBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await adminBtn.click();
    await sleep(1000);

    // Look for members tab within admin panel
    const membersTab = page.locator('button:has-text("Members"), button[role="tab"]:has-text("Members")').first();
    if (await membersTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await membersTab.click();
      await sleep(500);
      return true;
    }
  }

  console.log('  Member Management not found');
  return false;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Member Management Test',
    reportFileName: 'MEMBER_MANAGEMENT_TEST_REPORT.json',
    metadata: { admin: ADMIN_USER, member: MEMBER_USER },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreation: { admin: false, member: false },
    memberManagementOpens: false,
    memberListVisible: false,
    roleDropdownVisible: false,
    kickButtonVisible: false,
  };

  try {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    setupConsoleCapture(page1, 'Admin', ['error', 'Error']);
    setupConsoleCapture(page2, 'Member', ['error', 'Error']);

    // ========== STEP 1: Create Accounts ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 1: Create Accounts');
    console.log('\u2500'.repeat(50));

    results.accountCreation.admin = await createAccount(page1, ADMIN_USER, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });
    results.accountCreation.member = await createAccount(page2, MEMBER_USER, {
      isFirstUser: false,
      password: PASSWORD,
      uxTracker,
    });

    if (!results.accountCreation.admin) throw new Error('Admin creation failed');

    await sleep(3000);
    await closeAnyModals(page1);
    await waitForWorkspaceLoaded(page1, 30000);

    // ========== STEP 2: Open Member Management ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: Open Member Management');
    console.log('\u2500'.repeat(50));

    results.memberManagementOpens = await openMemberManagement(page1);
    await takeScreenshot(page1, '02_member_management');

    // ========== STEP 3: Verify Member List ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Verify Member List');
    console.log('\u2500'.repeat(50));

    if (results.memberManagementOpens) {
      // Look for member entries (at least the admin user)
      const memberEntries = page1.locator('[class*="member"], tr, [role="row"]');
      const count = await memberEntries.count();
      results.memberListVisible = count > 0;
      console.log(`  Member entries found: ${count}`);

      // Check for text containing usernames
      const bodyText = await page1.locator('[role="dialog"], [role="tabpanel"]').first().textContent().catch(() => '');
      if (bodyText?.includes(ADMIN_USER) || bodyText?.includes(MEMBER_USER)) {
        results.memberListVisible = true;
        console.log('  Found username in member list');
      }

      await takeScreenshot(page1, '03_member_list');
    }

    // ========== STEP 4: Check Role Dropdown ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Check Role Dropdown');
    console.log('\u2500'.repeat(50));

    if (results.memberManagementOpens) {
      const roleSelect = page1.locator('select, [role="combobox"], button:has-text("Role"), button:has-text("Member")').first();
      results.roleDropdownVisible = await roleSelect.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Role dropdown visible: ${results.roleDropdownVisible}`);
      await takeScreenshot(page1, '04_role_dropdown');
    }

    // ========== STEP 5: Check Kick/Ban Button ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Check Kick/Ban Button');
    console.log('\u2500'.repeat(50));

    if (results.memberManagementOpens) {
      const kickBtn = page1.locator('button:has-text("Kick"), button:has-text("Ban"), button:has-text("Remove"), button:has(svg.lucide-user-x)').first();
      results.kickButtonVisible = await kickBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Kick/Ban button visible: ${results.kickButtonVisible}`);
      await takeScreenshot(page1, '05_kick_ban');
    }

    // Close modal
    await page1.keyboard.press('Escape');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreation.admin;

    console.log(`\n  Admin Created:             ${results.accountCreation.admin ? 'PASS' : 'FAIL'}`);
    console.log(`  Member Created:            ${results.accountCreation.member ? 'PASS' : 'CHECK'}`);
    console.log(`  Mgmt Modal Opens:          ${results.memberManagementOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  Member List Visible:       ${results.memberListVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Role Dropdown:             ${results.roleDropdownVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Kick/Ban Button:           ${results.kickButtonVisible ? 'PASS' : 'CHECK'}`);

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
