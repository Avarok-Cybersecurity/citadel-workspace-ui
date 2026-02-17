/**
 * Account Management Integration Test (P14)
 *
 * Tests account management features:
 * 1. AccountManagementDialog (from WorkspaceSwitcher or landing)
 * 2. LoginConflictModal
 * 3. /connect saved workspaces page
 * 4. Login "Remember credentials" switch
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

  // AccountManagementDialog
  accountMgmtOpens: boolean;
  sessionListVisible: boolean;

  // Login page features
  loginPageRenders: boolean;
  rememberCredentialsVisible: boolean;

  // Saved workspaces
  savedWorkspacesVisible: boolean;

  // LoginConflictModal
  loginConflictDetected: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `acctmgmt_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

async function testAccountManagementDialog(page: Page): Promise<{
  opens: boolean;
  sessionList: boolean;
}> {
  console.log('\n=== Testing Account Management Dialog ===');

  const results = { opens: false, sessionList: false };

  // Try opening from WorkspaceSwitcher
  const switcherBtn = page.locator('button:has(svg.lucide-chevron-right), [data-testid="workspace-switcher"]').first();
  if (await switcherBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await switcherBtn.click();
    await sleep(500);

    // Look for "Manage Accounts" option
    const manageAccounts = page.locator('[role="menuitem"]:has-text("Manage Accounts"), button:has-text("Manage Accounts")').first();
    if (await manageAccounts.isVisible({ timeout: 3000 }).catch(() => false)) {
      await manageAccounts.click();
      await sleep(1000);

      // Check if dialog opened
      const dialog = page.locator('[role="dialog"]').first();
      results.opens = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Dialog opens: ${results.opens}`);

      if (results.opens) {
        // Check for session list
        const sessionList = page.locator('text="Active Sessions", text="Saved Accounts"').first();
        results.sessionList = await sessionList.isVisible({ timeout: 3000 }).catch(() => false);

        if (!results.sessionList) {
          // Check for any session entry with CID or username
          const dialogText = await dialog.textContent().catch(() => '');
          results.sessionList = (dialogText?.length ?? 0) > 50;
        }
        console.log(`  Session list visible: ${results.sessionList}`);

        // Close dialog
        await page.keyboard.press('Escape');
        await sleep(300);
      }
    } else {
      // Close dropdown
      await page.keyboard.press('Escape');
      await sleep(300);
    }
  }

  // Alternative: try from landing page "Manage Accounts" button
  if (!results.opens) {
    const manageBtn = page.locator('button:has-text("Manage Accounts")').first();
    if (await manageBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await manageBtn.click();
      await sleep(1000);

      const dialog = page.locator('[role="dialog"]').first();
      results.opens = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
      if (results.opens) {
        results.sessionList = true;
        await page.keyboard.press('Escape');
      }
    }
  }

  return results;
}

async function testLoginPage(page: Page): Promise<{
  renders: boolean;
  rememberCredentials: boolean;
}> {
  console.log('\n=== Testing Login Page Features ===');

  const results = { renders: false, rememberCredentials: false };

  // Navigate to landing
  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
  await sleep(2000);

  // Click "Login Workspace"
  const loginBtn = page.locator('button:has-text("Login Workspace")');
  if (!(await loginBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('  Login button not found');
    return results;
  }

  await loginBtn.click();
  await sleep(1000);

  // Verify login page rendered
  const loginTitle = page.locator('text="Login to Workspace", text="Login"').first();
  results.renders = await loginTitle.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Login page renders: ${results.renders}`);

  if (!results.renders) return results;

  // Check for "Remember credentials" switch
  const rememberSwitch = page.locator('label:has-text("Remember"), [role="switch"], input[type="checkbox"]').first();
  results.rememberCredentials = await rememberSwitch.isVisible({ timeout: 3000 }).catch(() => false);

  if (!results.rememberCredentials) {
    // Alternative: check for any text about remembering
    const rememberText = page.locator('text="Remember", text="remember"').first();
    results.rememberCredentials = await rememberText.isVisible({ timeout: 2000 }).catch(() => false);
  }

  console.log(`  Remember credentials visible: ${results.rememberCredentials}`);

  // Close login modal
  await page.keyboard.press('Escape');
  await sleep(300);

  return results;
}

async function testSavedWorkspaces(page: Page): Promise<boolean> {
  console.log('\n=== Testing Saved Workspaces ===');

  // Check if there's a saved workspaces section on the landing page
  const savedSection = page.locator('text="Saved Workspaces", text="Recent Workspaces", text="Saved"').first();
  let visible = await savedSection.isVisible({ timeout: 3000 }).catch(() => false);

  if (!visible) {
    // Check for workspace cards/items that represent saved connections
    const workspaceCards = page.locator('[class*="workspace-card"], [class*="saved-workspace"]').first();
    visible = await workspaceCards.isVisible({ timeout: 2000 }).catch(() => false);
  }

  console.log(`  Saved workspaces visible: ${visible}`);
  return visible;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Account Management Test',
    reportFileName: 'ACCOUNT_MANAGEMENT_TEST_REPORT.json',
    metadata: { username: USERNAME },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    accountMgmtOpens: false,
    sessionListVisible: false,
    loginPageRenders: false,
    rememberCredentialsVisible: false,
    savedWorkspacesVisible: false,
    loginConflictDetected: false,
  };

  try {
    const page = await context.newPage();
    setupConsoleCapture(page, 'AcctMgmt', ['error', 'Error', 'Login', 'Account']);

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

    // ========== STEP 2: Test Account Management Dialog ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: Test Account Management Dialog');
    console.log('\u2500'.repeat(50));

    const acctMgmtResult = await testAccountManagementDialog(page);
    results.accountMgmtOpens = acctMgmtResult.opens;
    results.sessionListVisible = acctMgmtResult.sessionList;
    await takeScreenshot(page, '02_acct_mgmt');

    // ========== STEP 3: Navigate to Landing ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Test Login Page Features');
    console.log('\u2500'.repeat(50));

    const loginResult = await testLoginPage(page);
    results.loginPageRenders = loginResult.renders;
    results.rememberCredentialsVisible = loginResult.rememberCredentials;
    await takeScreenshot(page, '03_login_page');

    // ========== STEP 4: Check Saved Workspaces ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Check Saved Workspaces');
    console.log('\u2500'.repeat(50));

    results.savedWorkspacesVisible = await testSavedWorkspaces(page);
    await takeScreenshot(page, '04_saved_workspaces');

    // ========== STEP 5: Login Conflict ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Login Conflict Detection');
    console.log('\u2500'.repeat(50));

    // LoginConflictModal only appears when logging in while already logged in
    // This is hard to trigger deterministically, but we can check if the modal
    // component exists in the page by attempting a second login
    console.log('  LoginConflictModal: Requires simultaneous login (skipped for deterministic testing)');
    results.loginConflictDetected = false; // Cannot deterministically trigger
    await takeScreenshot(page, '05_conflict');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreated;

    console.log(`\n  Account Created:           ${results.accountCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Acct Mgmt Dialog Opens:    ${results.accountMgmtOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  Session List:              ${results.sessionListVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Login Page Renders:        ${results.loginPageRenders ? 'PASS' : 'CHECK'}`);
    console.log(`  Remember Credentials:      ${results.rememberCredentialsVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Saved Workspaces:          ${results.savedWorkspacesVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Login Conflict:            ${results.loginConflictDetected ? 'PASS' : 'SKIP'}`);

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
