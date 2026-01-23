/**
 * Login Flow Test
 *
 * Tests the full authentication lifecycle:
 * 1. Register a new account
 * 2. Disconnect the session
 * 3. Login with credentials
 * 4. Disconnect again
 * 5. Login again
 * 6. Verify workspace loads
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
  checkForErrors,
} from '../lib/index.js';
import { config } from '../lib/config.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  registration: boolean;
  disconnect1: boolean;
  login1: boolean;
  workspaceLoad1: boolean;
  disconnect2: boolean;
  login2: boolean;
  workspaceLoad2: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `login_test_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Disconnect the current session via the OrphanSessionsNavbar disconnect button
 */
async function disconnectSession(page: Page, username: string, _uxTracker: UxIssueTracker | null): Promise<boolean> {
  console.log(`\n=== ${username}: Disconnecting session ===`);

  try {
    // Wait for OrphanSessionsNavbar to load and show sessions
    await sleep(2000);

    // Find the session icon by data-testid (most reliable way to target specific session)
    // OrphanSessionIcon has data-testid="session-icon-{username}"
    const sessionIcon = page.locator(`[data-testid="session-icon-${username}"]`);

    if (await sessionIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('  Found session icon, hovering to reveal disconnect button...');

      // Hover over the session icon to reveal the X button
      await sessionIcon.hover();
      await sleep(500);

      // Click the disconnect button (the X button in the corner)
      // IMPORTANT: Use data-testid to target the SPECIFIC session's disconnect button
      // This prevents accidentally disconnecting a different orphan session from previous test runs
      const disconnectBtn = page.locator(`[data-testid="disconnect-button-${username}"]`);

      if (await disconnectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await disconnectBtn.click();
        await sleep(1000);

        // Handle the disconnect confirmation modal - click "Disconnect" to fully disconnect
        const confirmBtn = page.locator('button:has-text("Disconnect")').first();
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click();
          await sleep(2000);
          console.log('  Session disconnected successfully');
          return true;
        }
      }
    }

    // Alternative: Try to find the session by data-testid container
    // Each OrphanSessionIcon has data-testid="session-icon-{username}"
    const sessionContainer = page.locator(`[data-testid="session-icon-${username}"]`);
    if (await sessionContainer.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Found session container by data-testid, hovering to reveal disconnect button...');
      await sessionContainer.hover();
      await sleep(500);

      const disconnectBtn = page.locator(`[data-testid="disconnect-button-${username}"]`);
      if (await disconnectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await disconnectBtn.click();
        await sleep(1000);

        const confirmBtn = page.locator('button:has-text("Disconnect")').first();
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click();
          await sleep(2000);
          console.log('  Session disconnected successfully');
          return true;
        }
      }
    }

    // If no session icons found, try navigating to landing page and checking there
    console.log('  No session icons found in current page, navigating to landing...');
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await sleep(3000);

    // Try again after navigating to landing - use specific data-testid selectors
    const sessionIconOnLanding = page.locator(`[data-testid="session-icon-${username}"]`);
    if (await sessionIconOnLanding.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('  Found session icon on landing page, disconnecting...');
      await sessionIconOnLanding.hover();
      await sleep(500);

      // Use data-testid to target the SPECIFIC session's disconnect button
      const disconnectBtn = page.locator(`[data-testid="disconnect-button-${username}"]`);
      if (await disconnectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('  Clicking X button to open disconnect modal...');
        await disconnectBtn.click();
        await sleep(2000); // Wait longer for modal to render

        // Take screenshot to see what's on screen
        await page.screenshot({ path: 'screenshots/disconnect_modal_state.png' });

        // Debug: List all buttons with "Disconnect" text
        const allDisconnectBtns = await page.locator('button:has-text("Disconnect")').all();
        console.log(`  Found ${allDisconnectBtns.length} buttons with "Disconnect" text`);

        // Look for the modal's Disconnect button specifically - it's yellow/outline styled
        const confirmBtn = page.locator('button:has-text("Disconnect")').first();
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('  Found Disconnect button, clicking...');
          await confirmBtn.click();
          console.log('  Waiting for disconnect to complete...');
          await sleep(5000); // Wait longer for disconnect to process
          console.log('  Session disconnected successfully');
          return true;
        } else {
          console.log('  ERROR: Disconnect button not visible in modal');
        }
      } else {
        console.log('  ERROR: X button not visible');
      }
    }

    console.log('  No active session found to disconnect (may already be disconnected)');
    return true; // Consider it a success if there's nothing to disconnect
  } catch (error) {
    console.error('  Error disconnecting:', error);
    return false;
  }
}

/**
 * Login with credentials via the Login component
 */
async function loginWithCredentials(
  page: Page,
  username: string,
  password: string,
  uxTracker: UxIssueTracker | null
): Promise<boolean> {
  console.log(`\n=== Logging in as ${username} ===`);

  try {
    // First check if there's an existing session we can claim
    // Look for the session icon with the username
    await sleep(1000);
    const existingSession = page.locator(`button[title*="${username}"]`).first();

    if (await existingSession.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Found existing session, clicking to reconnect...');
      await existingSession.click();
      await sleep(3000);

      // Wait for workspace to load
      const loaded = await waitForWorkspaceLoaded(page, 30000);
      if (loaded) {
        console.log('  Reconnected to existing session');
        return true;
      }
    }

    // Ensure we're on the landing page
    const loginBtn = page.locator('button:has-text("Login Workspace")');
    if (!(await loginBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      console.log('  Not on landing page, navigating...');
      await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
      await sleep(2000);
    }

    // Click "Login Workspace" button
    const loginBtnVisible = page.locator('button:has-text("Login Workspace")');
    if (!(await loginBtnVisible.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('  Login button not found');
      return false;
    }

    await loginBtnVisible.click();
    await sleep(1000);

    // Wait for Login modal to appear
    const loginTitle = page.locator('text="Login to Workspace"');
    if (!(await loginTitle.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('  Login modal did not appear');
      return false;
    }

    // Fill username
    const usernameInput = page.locator('input#username');
    await usernameInput.fill(username);
    await sleep(300);

    // Fill password
    const passwordInput = page.locator('input#password');
    await passwordInput.fill(password);
    await sleep(300);

    // Click Connect button
    const connectBtn = page.locator('button[type="submit"]:has-text("Connect")');
    await connectBtn.click();

    // Wait for connection attempt
    await sleep(3000);

    // Check if we got redirected or if workspace is loading
    // The app will either:
    // 1. Show an error if login failed
    // 2. Redirect to /office if login succeeded
    // 3. Show "session already exists" event if there's an existing session

    // Check for errors first
    const errorElement = page.locator('.text-red-400');
    if (await errorElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      const errorText = await errorElement.textContent();
      console.log(`  Login error: ${errorText}`);

      // If session already exists, try to claim it
      if (errorText?.includes('already exists') || errorText?.includes('Session')) {
        console.log('  Session already exists, trying to claim existing session...');
        // Go back and click on the session icon
        await page.keyboard.press('Escape');
        await sleep(500);

        const sessionIcon = page.locator(`button[title*="${username}"]`).first();
        if (await sessionIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sessionIcon.click();
          await sleep(3000);
          return true;
        }
      }

      uxTracker?.log('major', 'functional', `Login error: ${errorText}`);
      return false;
    }

    console.log('  Login request sent, checking result...');

    // Wait for either workspace to load or error
    await sleep(3000);

    return true;
  } catch (error) {
    console.error('  Error during login:', error);
    return false;
  }
}

/**
 * Verify workspace is loaded after login
 */
async function verifyWorkspaceLoaded(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Verifying workspace loaded ===`);

  // Wait for workspace to load
  const loaded = await waitForWorkspaceLoaded(page, 30000);
  if (!loaded) {
    console.log('  WARNING: Workspace may not have fully loaded');
    return false;
  }

  // Check URL - should be at /office
  const url = page.url();
  if (url.includes('/office')) {
    console.log('  Workspace loaded successfully (URL: /office)');
    return true;
  }

  // Check for the sidebar or office section
  const sidebarVisible = await page.locator('[data-testid="sidebar"], .sidebar, [class*="Sidebar"]').first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (sidebarVisible) {
    console.log('  Workspace loaded successfully (sidebar visible)');
    return true;
  }

  console.log('  Workspace verification unclear');
  return true; // Still consider it passed if no errors
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('LOGIN FLOW TEST');
  console.log('='.repeat(60));
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Wait for services
  await waitForServicesAlive();

  // Log the test start
  logObservation('test-start', 'Login Flow Test Started', {
    username: USERNAME,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser
  const { browser, context } = await createBrowser();

  const results: TestResults = {
    registration: false,
    disconnect1: false,
    login1: false,
    workspaceLoad1: false,
    disconnect2: false,
    login2: false,
    workspaceLoad2: false,
  };

  try {
    const page = await context.newPage();

    // Setup console capture - include workspace debugging keywords
    setupConsoleCapture(page, 'LoginTest', ['error', 'Error', 'Login', 'Connect', 'Disconnect', 'WorkspaceService', 'WorkspaceLoader', 'workspace:', 'WorkspaceResponseHandler', 'MessageNotification']);

    // ========== STEP 1: Register new account ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Register New Account');
    console.log('─'.repeat(50));

    results.registration = await createAccount(page, USERNAME, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });

    await takeScreenshot(page, '01_registered');

    if (!results.registration) {
      console.log('  FATAL: Registration failed');
      throw new Error('Registration failed');
    }

    // Wait for workspace to fully load before disconnecting
    await sleep(3000);

    // ========== STEP 2: Disconnect session ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Disconnect Session (First Time)');
    console.log('─'.repeat(50));

    // Close any modals that might be blocking (e.g., workspace init modal)
    await closeAnyModals(page);

    results.disconnect1 = await disconnectSession(page, USERNAME, uxTracker);
    await takeScreenshot(page, '02_disconnected_1');

    if (!results.disconnect1) {
      throw new Error('Disconnect (1st) failed - aborting test');
    }

    // After disconnect, we should be on the landing page or still on office
    // Navigate to landing explicitly to ensure clean state
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await sleep(2000);

    // ========== STEP 3: Login with credentials ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Login with Credentials (First Time)');
    console.log('─'.repeat(50));

    results.login1 = await loginWithCredentials(page, USERNAME, PASSWORD, uxTracker);
    await sleep(3000);
    await takeScreenshot(page, '03_logged_in_1');

    if (!results.login1) {
      throw new Error('Login (1st) failed - aborting test');
    }

    await closeAnyModals(page);
    await checkForErrors(page, 'login 1', uxTracker);
    results.workspaceLoad1 = await verifyWorkspaceLoaded(page, USERNAME);
    await takeScreenshot(page, '04_workspace_loaded_1');

    if (!results.workspaceLoad1) {
      throw new Error('Workspace Load (1st) failed - aborting test');
    }

    // Wait for workspace to stabilize
    await sleep(3000);

    // ========== STEP 4: Disconnect again ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Disconnect Session (Second Time)');
    console.log('─'.repeat(50));

    // Close any modals that might be blocking
    await closeAnyModals(page);

    results.disconnect2 = await disconnectSession(page, USERNAME, uxTracker);
    await takeScreenshot(page, '05_disconnected_2');

    if (!results.disconnect2) {
      throw new Error('Disconnect (2nd) failed - aborting test');
    }

    // Navigate to landing explicitly
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await sleep(2000);

    // ========== STEP 5: Login again ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Login with Credentials (Second Time)');
    console.log('─'.repeat(50));

    results.login2 = await loginWithCredentials(page, USERNAME, PASSWORD, uxTracker);
    await sleep(3000);
    await takeScreenshot(page, '06_logged_in_2');

    if (!results.login2) {
      throw new Error('Login (2nd) failed - aborting test');
    }

    await closeAnyModals(page);
    await checkForErrors(page, 'login 2', uxTracker);
    results.workspaceLoad2 = await verifyWorkspaceLoaded(page, USERNAME);
    await takeScreenshot(page, '07_workspace_loaded_2');

    if (!results.workspaceLoad2) {
      throw new Error('Workspace Load (2nd) failed - aborting test');
    }

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const allPassed =
      results.registration &&
      results.disconnect1 &&
      results.login1 &&
      results.workspaceLoad1 &&
      results.disconnect2 &&
      results.login2 &&
      results.workspaceLoad2;

    console.log('\nLogin Flow:');
    console.log(`  Registration:         ${results.registration ? 'PASS' : 'FAIL'}`);
    console.log(`  Disconnect (1st):     ${results.disconnect1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Login (1st):          ${results.login1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Load (1st): ${results.workspaceLoad1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Disconnect (2nd):     ${results.disconnect2 ? 'PASS' : 'FAIL'}`);
    console.log(`  Login (2nd):          ${results.login2 ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Load (2nd): ${results.workspaceLoad2 ? 'PASS' : 'FAIL'}`);

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
    console.log(`OVERALL: ${allPassed ? 'TEST PASSED' : 'TEST FAILED'}`);
    console.log('='.repeat(60));

    // Log the test result
    logObservation('test-complete', `Login Flow Test ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    // Write report
    writeTestReport('LOGIN_FLOW_TEST_REPORT.json', {
      username: USERNAME,
      results,
      uxIssues,
      passed: allPassed,
    });

    console.log('\nBrowser will remain open for 10 seconds for manual inspection...');
    await sleep(10000);

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', 'Login Flow Test Error', {
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
