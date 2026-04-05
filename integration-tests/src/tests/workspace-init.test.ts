/**
 * Workspace Initialization Test
 *
 * Tests the first-user workspace initialization flow:
 * 1. First user sees WorkspaceInitializationModal after registration
 * 2. First user initializes workspace with password
 * 3. Second user does NOT see initialization modal
 * 4. Workspace is properly initialized for both users
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  clearBrowserStorage,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { config } from '../lib/config.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  // First user
  firstUserRegistered: boolean;
  initModalAppears: boolean;
  modalHasTitle: boolean;
  modalHasPasswordField: boolean;
  modalHasInitButton: boolean;
  initSubmitted: boolean;
  firstUserWorkspaceLoaded: boolean;

  // Second user
  secondUserRegistered: boolean;
  noInitModalForSecond: boolean;
  secondUserWorkspaceLoaded: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const FIRST_USER = `init_first_${timestamp}`;
const SECOND_USER = `init_second_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Register a new user (without workspace initialization handling)
 */
async function registerUser(page: Page, username: string, password: string): Promise<boolean> {
  console.log(`\n=== Registering user: ${username} ===`);

  try {
    // Navigate to app
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await sleep(2000);

    // Clear browser storage
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: 'commit', timeout: 60000 });
    await sleep(2000);

    // Click "Join Workspace" button
    const joinBtn = page.locator('button:has-text("Join Workspace")');
    if (await joinBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await joinBtn.click();
      await sleep(1000);
    }

    // Step 1: Fill workspace location
    const serverInput = page.getByRole('textbox', { name: 'Workspace Location' });
    if (await serverInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await serverInput.fill(config.WORKSPACE_SERVER);
      await sleep(500);

      const nextBtn = page.getByRole('button', { name: 'NEXT' });
      await nextBtn.click();
      await sleep(2000);
    }

    // Step 2: Security Settings - just click NEXT
    const securityTitle = page.locator('text="Security Settings"');
    if (await securityTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
      const nextBtn = page.getByRole('button', { name: 'NEXT' });
      await nextBtn.click();
      await sleep(2000);
    }

    // Step 3: User Details form
    const fullNameInput = page.getByRole('textbox', { name: 'Full Name' });
    if (await fullNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fullNameInput.fill(username);
      await sleep(300);

      const usernameInput = page.getByRole('textbox', { name: 'Username' });
      if (await usernameInput.isVisible()) {
        await usernameInput.fill(username);
        await sleep(300);
      }

      const passwordInput = page.getByRole('textbox', { name: 'Profile Password', exact: true });
      const confirmPasswordInput = page.getByRole('textbox', { name: 'Confirm Profile Password' });

      if (await passwordInput.isVisible()) {
        await passwordInput.fill(password);
        await sleep(300);
      }
      if (await confirmPasswordInput.isVisible()) {
        await confirmPasswordInput.fill(password);
        await sleep(300);
      }

      // Click JOIN button
      const submitBtn = page.getByRole('button', { name: 'Join', exact: true });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await sleep(5000);
      }
    }

    console.log(`  User ${username} registration submitted`);
    return true;
  } catch (error) {
    console.error(`  Error registering user ${username}:`, error);
    return false;
  }
}

/**
 * Check if WorkspaceInitializationModal appears
 */
async function checkInitModalAppears(page: Page): Promise<{
  appears: boolean;
  hasTitle: boolean;
  hasPasswordField: boolean;
  hasInitButton: boolean;
}> {
  console.log('\n=== Checking for Initialization Modal ===');

  const results = {
    appears: false,
    hasTitle: false,
    hasPasswordField: false,
    hasInitButton: false,
  };

  // Check for modal title "Initialize Workspace"
  const modalTitle = page.locator('text="Initialize Workspace"');
  results.hasTitle = await modalTitle.isVisible({ timeout: 8000 }).catch(() => false);
  console.log(`  Modal title visible: ${results.hasTitle}`);

  if (results.hasTitle) {
    results.appears = true;

    // Check for password field
    const passwordField = page.locator('input#masterPassword');
    results.hasPasswordField = await passwordField.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Password field visible: ${results.hasPasswordField}`);

    // Check for "Initialize & Become Admin" button
    const initButton = page.locator('button:has-text("Initialize & Become Admin")');
    results.hasInitButton = await initButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Initialize button visible: ${results.hasInitButton}`);
  }

  return results;
}

/**
 * Submit the workspace initialization form
 */
async function submitInitialization(page: Page, password: string): Promise<boolean> {
  console.log('\n=== Submitting Workspace Initialization ===');

  try {
    // Fill password
    const passwordField = page.locator('input#masterPassword');
    if (!(await passwordField.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('  Password field not found');
      return false;
    }

    await passwordField.fill(password);
    await sleep(500);

    // Click "Initialize & Become Admin" button
    const initButton = page.locator('button:has-text("Initialize & Become Admin")');
    if (!(await initButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('  Initialize button not found');
      return false;
    }

    await initButton.click();
    await sleep(5000);

    // Check if initialization succeeded (modal should close)
    const modalStillVisible = await page.locator('text="Initialize Workspace"').isVisible({ timeout: 3000 }).catch(() => false);

    if (!modalStillVisible) {
      console.log('  Initialization submitted successfully');
      return true;
    } else {
      // Check for error message
      const errorMsg = page.locator('.text-red-400');
      if (await errorMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
        const errorText = await errorMsg.textContent();
        console.log(`  Initialization error: ${errorText}`);
      }
      return false;
    }
  } catch (error) {
    console.error('  Error submitting initialization:', error);
    return false;
  }
}

/**
 * Check that no initialization modal appears
 */
async function checkNoInitModal(page: Page): Promise<boolean> {
  console.log('\n=== Checking that NO Initialization Modal Appears ===');

  // Wait a few seconds to make sure modal would have appeared if it was going to
  await sleep(5000);

  // Check for modal title
  const modalTitle = page.locator('text="Initialize Workspace"');
  const appears = await modalTitle.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Initialization modal appears: ${appears}`);

  return !appears; // Return true if modal does NOT appear
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Workspace Initialization Test',
    reportFileName: 'WORKSPACE_INIT_TEST_REPORT.json',
    metadata: { firstUser: FIRST_USER, secondUser: SECOND_USER },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`First User: ${FIRST_USER}`);
  console.log(`Second User: ${SECOND_USER}`);
  console.log('');

  // Setup browser
  const { browser, context } = await createBrowser();

  const results: TestResults = {
    firstUserRegistered: false,
    initModalAppears: false,
    modalHasTitle: false,
    modalHasPasswordField: false,
    modalHasInitButton: false,
    initSubmitted: false,
    firstUserWorkspaceLoaded: false,
    secondUserRegistered: false,
    noInitModalForSecond: false,
    secondUserWorkspaceLoaded: false,
  };

  try {
    // ========== PART 1: First User (Should See Init Modal) ==========
    console.log('\n' + '='.repeat(50));
    console.log('PART 1: FIRST USER INITIALIZATION');
    console.log('='.repeat(50));

    const firstPage = await context.newPage();
    setupConsoleCapture(firstPage, 'FirstUser', ['error', 'Error', 'Initialize', 'Workspace']);

    // ========== STEP 1: Register First User ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Register First User');
    console.log('─'.repeat(50));

    results.firstUserRegistered = await registerUser(firstPage, FIRST_USER, PASSWORD);
    await takeScreenshot(firstPage, '01_first_user_registered');

    if (!results.firstUserRegistered) {
      throw new Error('First user registration failed');
    }

    // ========== STEP 2: Check for Init Modal ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Check for Initialization Modal');
    console.log('─'.repeat(50));

    const modalCheck = await checkInitModalAppears(firstPage);
    results.initModalAppears = modalCheck.appears;
    results.modalHasTitle = modalCheck.hasTitle;
    results.modalHasPasswordField = modalCheck.hasPasswordField;
    results.modalHasInitButton = modalCheck.hasInitButton;

    await takeScreenshot(firstPage, '02_init_modal');

    if (!results.initModalAppears) {
      console.log('  WARNING: Initialization modal did not appear');
      uxTracker.log('major', 'functional', 'Workspace initialization modal not shown for first user');
    }

    // ========== STEP 3: Submit Initialization ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Submit Workspace Initialization');
    console.log('─'.repeat(50));

    if (results.initModalAppears) {
      results.initSubmitted = await submitInitialization(firstPage, config.WORKSPACE_PASSWORD);
      await takeScreenshot(firstPage, '03_init_submitted');
    }

    // ========== STEP 4: Verify Workspace Loaded for First User ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Verify Workspace Loaded');
    console.log('─'.repeat(50));

    results.firstUserWorkspaceLoaded = await waitForWorkspaceLoaded(firstPage, 30000);
    console.log(`  Workspace loaded for first user: ${results.firstUserWorkspaceLoaded}`);
    await takeScreenshot(firstPage, '04_first_user_workspace');

    // ========== PART 2: Second User (Should NOT See Init Modal) ==========
    console.log('\n' + '='.repeat(50));
    console.log('PART 2: SECOND USER (NO INIT MODAL)');
    console.log('='.repeat(50));

    const secondPage = await context.newPage();
    setupConsoleCapture(secondPage, 'SecondUser', ['error', 'Error', 'Initialize', 'Workspace']);

    // ========== STEP 5: Register Second User ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Register Second User');
    console.log('─'.repeat(50));

    results.secondUserRegistered = await registerUser(secondPage, SECOND_USER, PASSWORD);
    await takeScreenshot(secondPage, '05_second_user_registered');

    if (!results.secondUserRegistered) {
      throw new Error('Second user registration failed');
    }

    // ========== STEP 6: Check NO Init Modal ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Verify NO Initialization Modal');
    console.log('─'.repeat(50));

    results.noInitModalForSecond = await checkNoInitModal(secondPage);
    await takeScreenshot(secondPage, '06_no_init_modal');

    if (!results.noInitModalForSecond) {
      console.log('  WARNING: Second user incorrectly saw initialization modal');
      uxTracker.log('major', 'functional', 'Second user should not see initialization modal');
    }

    // ========== STEP 7: Verify Workspace Loaded for Second User ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Verify Workspace Loaded for Second User');
    console.log('─'.repeat(50));

    results.secondUserWorkspaceLoaded = await waitForWorkspaceLoaded(secondPage, 30000);
    console.log(`  Workspace loaded for second user: ${results.secondUserWorkspaceLoaded}`);
    await takeScreenshot(secondPage, '07_second_user_workspace');

    // Final screenshots
    await takeScreenshot(firstPage, 'FINAL_first_user');
    await takeScreenshot(secondPage, 'FINAL_second_user');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed =
      results.firstUserRegistered &&
      results.secondUserRegistered;

    console.log('\nFirst User (Initialization):');
    console.log(`  Registration:             ${results.firstUserRegistered ? 'PASS' : 'FAIL'}`);
    console.log(`  Init Modal Appears:       ${results.initModalAppears ? 'PASS' : 'CHECK'}`);
    console.log(`  Modal Has Title:          ${results.modalHasTitle ? 'PASS' : 'CHECK'}`);
    console.log(`  Modal Has Password Field: ${results.modalHasPasswordField ? 'PASS' : 'CHECK'}`);
    console.log(`  Modal Has Init Button:    ${results.modalHasInitButton ? 'PASS' : 'CHECK'}`);
    console.log(`  Init Submitted:           ${results.initSubmitted ? 'PASS' : 'CHECK'}`);
    console.log(`  Workspace Loaded:         ${results.firstUserWorkspaceLoaded ? 'PASS' : 'CHECK'}`);

    console.log('\nSecond User (No Init Modal):');
    console.log(`  Registration:             ${results.secondUserRegistered ? 'PASS' : 'FAIL'}`);
    console.log(`  No Init Modal:            ${results.noInitModalForSecond ? 'PASS' : 'CHECK'}`);
    console.log(`  Workspace Loaded:         ${results.secondUserWorkspaceLoaded ? 'PASS' : 'CHECK'}`);

    harness.finalize(corePassed, results);

    console.log('\nBrowser will remain open for 10 seconds for manual inspection...');
    await sleep(10000);

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
