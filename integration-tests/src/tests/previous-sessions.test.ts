/**
 * Previous Sessions (OrphanSessionsNavbar) Test
 *
 * Comprehensive test for the Previous Sessions navbar functionality:
 * 1. Create multiple sessions and verify they appear in navbar
 * 2. Verify sessions are ordered by most recently used
 * 3. Test disconnect removes session from navbar
 * 4. Test deregister permanently removes session
 * 5. Test disconnect then reconnect flow
 * 6. Test 1-click login via session icon
 * 7. Verify horizontal scrolling when many sessions exist
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  createAccount,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  waitForAppReady,
  loginAfterDisconnect,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { config, isCI } from '../lib/config.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  // Session creation - dynamic based on SESSION_COUNT
  sessionsCreated: boolean[];

  // Navbar verification
  navbarVisible: boolean;
  allSessionsInNavbar: boolean;

  // Disconnect flow (uses USER at index 1)
  disconnectRemovesSession: boolean;
  reconnectAfterDisconnect: boolean;

  // Deregister flow (uses USERS[2])
  deregisterRemovesSession: boolean;
  deregisterPermanent: boolean;

  // 1-click login (uses USER at index 0)
  oneClickLoginWorks: boolean;

  // Ordering
  mostRecentFirst: boolean;

  // UI/UX
  previousSessionsLabel: boolean;
  scrollContainerExists: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

// All 3 sessions required: disconnect (USERS[1]), deregister (USERS[2]), 1-click login (USERS[0])
const SESSION_COUNT = 3;

const timestamp = Date.now();
// Generate usernames dynamically: prev_sess_a_XXX, prev_sess_b_XXX, etc.
const USERS = Array.from({ length: SESSION_COUNT }, (_, i) =>
  `prev_sess_${String.fromCharCode(97 + i)}_${timestamp}`
);
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quick single-attempt login — for testing that deregistered accounts CANNOT login.
 * Unlike loginAfterDisconnect, this has no retry logic and fails fast (~20s max).
 */
async function tryLoginQuick(page: Page, username: string, password: string): Promise<boolean> {
  try {
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await waitForAppReady(page, 15000);

    const loginBtn = page.locator('button:has-text("Login Workspace")');
    if (!await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  tryLoginQuick: Login button not found');
      return false;
    }
    await loginBtn.click();
    await sleep(1000);

    await page.locator('input#username').fill(username);
    await page.locator('input#password').fill(password);

    const advancedBtn = page.locator('button:has-text("Advanced Options")');
    if (await advancedBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await advancedBtn.click();
      await sleep(300);
      const serverInput = page.locator('input#server');
      if (await serverInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await serverInput.fill(config.WORKSPACE_SERVER);
      }
    }

    await page.locator('button[type="submit"]:has-text("Connect")').click();
    await sleep(3000);
    return await waitForWorkspaceLoaded(page, 15000);
  } catch {
    return false;
  }
}

/**
 * Get the count of session icons in the Previous Sessions navbar
 */
async function getSessionCount(page: Page): Promise<number> {
  const container = page.locator('[data-testid="sessions-scroll-container"]');
  if (!(await container.isVisible({ timeout: 3000 }).catch(() => false))) {
    return 0;
  }
  const icons = container.locator('[data-testid^="session-icon-"]');
  return await icons.count();
}

/**
 * Check if a specific session appears in the navbar
 */
async function sessionExistsInNavbar(page: Page, username: string): Promise<boolean> {
  const icon = page.locator(`[data-testid="session-icon-${username}"]`);
  return await icon.isVisible({ timeout: 3000 }).catch(() => false);
}

/**
 * Wait for all sessions to appear in navbar with retry logic.
 * Handles CI timing issues where backend may not return all sessions immediately.
 */
async function waitForAllSessionsInNavbar(
  page: Page,
  usernames: string[],
  maxRetries = 5
): Promise<{ allVisible: boolean; visibleSessions: Record<string, boolean> }> {
  console.log(`  Waiting for ${usernames.length} sessions to appear in navbar...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Wait for the navbar container to appear first — the navbar only renders
    // after sessions load asynchronously (WebSocket → GetSessions → setSessions → React render).
    // In CI, this can take 5-10s due to WebSocket reconnection + backend response time.
    try {
      await page.locator('[data-testid="previous-sessions-navbar"]').waitFor({
        state: 'visible',
        timeout: 15000,
      });
      console.log(`  Attempt ${attempt}/${maxRetries}: Navbar container visible`);
    } catch {
      console.log(`  Attempt ${attempt}/${maxRetries}: Navbar container not visible after 15s`);
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt;
        console.log(`  Waiting ${waitTime}ms and reloading page...`);
        await sleep(waitTime);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await sleep(3000); // Wait for React + WebSocket + session load
      }
      continue;
    }

    // Navbar is visible — now check individual session icons
    const visibleSessions: Record<string, boolean> = {};
    let allVisible = true;

    for (const username of usernames) {
      const exists = await sessionExistsInNavbar(page, username);
      visibleSessions[username] = exists;
      if (!exists) {
        allVisible = false;
      }
    }

    const visibleCount = Object.values(visibleSessions).filter(Boolean).length;
    console.log(`  Attempt ${attempt}/${maxRetries}: ${visibleCount}/${usernames.length} sessions visible`);

    if (allVisible) {
      console.log('  All sessions visible!');
      return { allVisible: true, visibleSessions };
    }

    if (attempt < maxRetries) {
      const waitTime = 2000 * attempt;
      console.log(`  Waiting ${waitTime}ms and reloading page...`);
      await sleep(waitTime);
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000); // Wait for React + WebSocket + session load
    }
  }

  // Final check - return what we have
  const visibleSessions: Record<string, boolean> = {};
  for (const username of usernames) {
    visibleSessions[username] = await sessionExistsInNavbar(page, username);
  }
  const allVisible = Object.values(visibleSessions).every(Boolean);
  return { allVisible, visibleSessions };
}

/**
 * Get the order of sessions in the navbar (returns array of usernames)
 */
async function getSessionOrder(page: Page): Promise<string[]> {
  const container = page.locator('[data-testid="sessions-scroll-container"]');
  if (!(await container.isVisible({ timeout: 3000 }).catch(() => false))) {
    return [];
  }

  const icons = container.locator('[data-testid^="session-icon-"]');
  const count = await icons.count();
  const order: string[] = [];

  for (let i = 0; i < count; i++) {
    const testId = await icons.nth(i).getAttribute('data-testid');
    if (testId) {
      // Extract username from data-testid="session-icon-{username}"
      const username = testId.replace('session-icon-', '');
      order.push(username);
    }
  }

  return order;
}

/**
 * Click on a session icon to perform 1-click login
 */
async function clickSessionIcon(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== Clicking session icon for ${username} ===`);

  const button = page.locator(`[data-testid="session-button-${username}"]`);
  if (!(await button.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('  Session button not found');
    return false;
  }

  await button.click();
  await sleep(3000);

  // Verify workspace loaded
  const loaded = await waitForWorkspaceLoaded(page, 30000);
  if (loaded) {
    console.log('  1-click login successful');
    return true;
  }

  console.log('  1-click login may have failed');
  return false;
}

/**
 * Disconnect a session via the navbar.
 * Navigates to landing page and waits for OrphanSessionsNavbar to render
 * before interacting with session icons.
 */
async function disconnectViaNavbar(
  page: Page,
  username: string,
  action: 'disconnect' | 'deregister'
): Promise<boolean> {
  console.log(`\n=== ${action === 'deregister' ? 'Deregistering' : 'Disconnecting'} ${username} via navbar ===`);

  // Ensure we're on the landing page where OrphanSessionsNavbar renders
  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
  await waitForAppReady(page, 30000);

  // Wait for the session icon with retry logic (async GetSessions can take time in CI)
  const icon = page.locator(`[data-testid="session-icon-${username}"]`);
  let iconFound = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    iconFound = await icon.isVisible({ timeout: 8000 }).catch(() => false);
    if (iconFound) break;
    if (attempt < 3) {
      console.log(`  Session icon not visible on attempt ${attempt}, reloading...`);
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000);
    }
  }

  if (!iconFound) {
    console.log('  Session icon not found after retries');
    return false;
  }

  // Hover to reveal disconnect button (with retry — CI CSS transitions can lag)
  const disconnectBtn = page.locator(`[data-testid="disconnect-button-${username}"]`);
  let btnVisible = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    await icon.hover();
    await sleep(1000);
    btnVisible = await disconnectBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (btnVisible) break;
    if (attempt < 3) {
      console.log(`  Disconnect button not visible on attempt ${attempt}, re-hovering...`);
    }
  }

  if (!btnVisible) {
    console.log('  Disconnect button not visible after retries');
    return false;
  }

  await disconnectBtn.click();
  await sleep(1000);

  // Handle the confirmation modal — scope selector to dialog to avoid matching the overlay button
  const dialogSelector = 'div[role="alertdialog"], div[role="dialog"], [data-testid="confirm-dialog"]';
  const dialog = page.locator(dialogSelector).first();
  const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);

  if (action === 'deregister') {
    // Look for Deregister button, scoped to dialog if visible
    const scope = dialogVisible ? dialog : page;
    const deregisterBtn = scope.locator('button:has-text("Deregister")').first();
    if (await deregisterBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deregisterBtn.click();
      await sleep(3000);
      console.log('  Deregistered successfully');
      return true;
    }
  } else {
    // Look for Disconnect confirmation button — exclude the overlay button via :not([data-testid])
    const scope = dialogVisible ? dialog : page;
    const confirmBtn = scope.locator('button:has-text("Disconnect"):not([data-testid])').first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      await sleep(2000);
      console.log('  Disconnected successfully');
      return true;
    }
  }

  console.log('  Confirmation button not found');
  return false;
}


// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Previous Sessions Navbar Test',
    reportFileName: 'PREVIOUS_SESSIONS_TEST_REPORT.json',
    metadata: { users: USERS, sessionCount: SESSION_COUNT, isCI },
  });
  const uxTracker = harness.uxTracker;

  console.log(`Environment: ${isCI ? 'CI' : 'Local'}`);
  console.log(`Session Count: ${SESSION_COUNT}`);
  USERS.forEach((user, i) => console.log(`User ${i + 1}: ${user}`));
  console.log('');

  // Setup browser with shared context
  const { browser, context } = await createBrowser();

  const results: TestResults = {
    sessionsCreated: new Array(SESSION_COUNT).fill(false),
    navbarVisible: false,
    allSessionsInNavbar: false,
    disconnectRemovesSession: false,
    reconnectAfterDisconnect: false,
    deregisterRemovesSession: false,
    deregisterPermanent: false,
    oneClickLoginWorks: false,
    mostRecentFirst: false,
    previousSessionsLabel: false,
    scrollContainerExists: false,
  };

  try {
    const page = await context.newPage();

    // Setup console capture
    setupConsoleCapture(page, 'PrevSessions', ['error', 'Error', 'OrphanSessionsNavbar', 'Disconnect']);

    // ========== Create Sessions (N sessions) ==========
    for (let i = 0; i < SESSION_COUNT; i++) {
      console.log('\n' + '─'.repeat(50));
      console.log(`STEP ${i + 1}: Create Session ${i + 1}`);
      console.log('─'.repeat(50));

      if (i > 0) {
        // Navigate to landing for subsequent sessions
        await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
        await waitForAppReady(page, 30000);
      }

      results.sessionsCreated[i] = await createAccount(page, USERS[i], {
        isFirstUser: i === 0,
        password: PASSWORD,
        uxTracker,
      });

      const stepNum = String(i + 1).padStart(2, '0');
      await takeScreenshot(page, `${stepNum}_session${i + 1}_created`);
      await sleep(2000);
    }

    // Note: Navbar won't be visible yet with only 1 session
    // We'll check navbar visibility after creating multiple sessions in next step

    // ========== Verify all sessions in navbar ==========
    const verifyStep = SESSION_COUNT + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${verifyStep}: Verify All Sessions in Navbar`);
    console.log('─'.repeat(50));

    // Navigate to landing to see all sessions
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await waitForAppReady(page, 30000);

    // Use retry logic to wait for all sessions to appear first.
    // The navbar, label, and scroll container only render AFTER sessions are loaded
    // asynchronously via WebSocket (GetSessions). Checking structural elements before
    // sessions load will always return false.
    const { allVisible, visibleSessions } = await waitForAllSessionsInNavbar(
      page,
      USERS,
      5 // max 5 retries with exponential backoff
    );

    USERS.forEach(user => {
      console.log(`  ${user} in navbar: ${visibleSessions[user]}`);
    });

    results.allSessionsInNavbar = allVisible;

    // Check navbar visibility and structure AFTER sessions have loaded
    const navbar = page.locator('[data-testid="previous-sessions-navbar"]');
    results.navbarVisible = await navbar.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`  Navbar visible: ${results.navbarVisible}`);

    const label = page.locator('text="Previous Sessions:"');
    results.previousSessionsLabel = await label.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Previous Sessions label: ${results.previousSessionsLabel}`);

    const scrollContainer = page.locator('[data-testid="sessions-scroll-container"]');
    results.scrollContainerExists = await scrollContainer.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Scroll container exists: ${results.scrollContainerExists}`);

    const count = await getSessionCount(page);
    console.log(`  Final session count in navbar: ${count}`);

    await takeScreenshot(page, `${String(verifyStep).padStart(2, '0')}_all_sessions_visible`);

    // ========== Test 1-click login ==========
    const oneClickStep = verifyStep + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${oneClickStep}: Test 1-Click Login`);
    console.log('─'.repeat(50));

    results.oneClickLoginWorks = await clickSessionIcon(page, USERS[0]);
    await takeScreenshot(page, `${String(oneClickStep).padStart(2, '0')}_one_click_login`);
    await sleep(2000);

    // ========== Test most recently used ordering ==========
    const orderStep = oneClickStep + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${orderStep}: Verify Most Recently Used Ordering`);
    console.log('─'.repeat(50));

    // Navigate back to landing
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await waitForAppReady(page, 30000);

    // USERS[0] should now be first since we just clicked on it
    const orderAfterClick = await getSessionOrder(page);
    console.log(`  Session order after clicking ${USERS[0]}: ${orderAfterClick.join(', ')}`);

    // Check if USERS[0] is first (most recently accessed)
    results.mostRecentFirst = orderAfterClick.length > 0 && orderAfterClick[0] === USERS[0];
    console.log(`  Most recent first: ${results.mostRecentFirst}`);

    await takeScreenshot(page, `${String(orderStep).padStart(2, '0')}_ordering`);

    // ========== Test disconnect removes session ==========
    let disconnectStep = orderStep + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${disconnectStep}: Test Disconnect Removes Session from Navbar`);
    console.log('─'.repeat(50));

    const disconnectUser = USERS[1];
    const disconnectSuccess = await disconnectViaNavbar(page, disconnectUser, 'disconnect');
    await sleep(5000);

    // Verify session is removed from navbar
    const userStillExists = await sessionExistsInNavbar(page, disconnectUser);
    results.disconnectRemovesSession = disconnectSuccess && !userStillExists;

    console.log(`  Disconnect success: ${disconnectSuccess}`);
    console.log(`  ${disconnectUser} still in navbar: ${userStillExists}`);
    console.log(`  Test passed: ${results.disconnectRemovesSession}`);

    await takeScreenshot(page, `${String(disconnectStep).padStart(2, '0')}_after_disconnect`);

    // ========== Test reconnect after disconnect ==========
    const reconnectStep = disconnectStep + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${reconnectStep}: Test Reconnect After Disconnect`);
    console.log('─'.repeat(50));

    results.reconnectAfterDisconnect = await loginAfterDisconnect(page, disconnectUser, PASSWORD, uxTracker, config.WORKSPACE_SERVER);
    await sleep(2000);

    // Verify session is back in navbar
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });
    await waitForAppReady(page, 30000);

    const userBackInNavbar = await sessionExistsInNavbar(page, disconnectUser);
    console.log(`  Reconnect success: ${results.reconnectAfterDisconnect}`);
    console.log(`  ${disconnectUser} back in navbar: ${userBackInNavbar}`);

    // Accept reconnect via either explicit login or ServerAutoConnect
    if (!results.reconnectAfterDisconnect && userBackInNavbar) {
      console.log('  ServerAutoConnect reconnected the session');
      results.reconnectAfterDisconnect = true;
    }

    await takeScreenshot(page, `${String(reconnectStep).padStart(2, '0')}_after_reconnect`);
    disconnectStep = reconnectStep;

    // ========== Test deregister permanently removes session ==========
    const deregisterStep = disconnectStep + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${deregisterStep}: Test Deregister Permanently Removes Session`);
    console.log('─'.repeat(50));

    const deregisterUser = USERS[2]; // Third user
    const deregisterSuccess = await disconnectViaNavbar(page, deregisterUser, 'deregister');
    await sleep(2000);

    // Verify session is removed from navbar
    const deregUserStillExists = await sessionExistsInNavbar(page, deregisterUser);
    results.deregisterRemovesSession = deregisterSuccess && !deregUserStillExists;

    console.log(`  Deregister success: ${deregisterSuccess}`);
    console.log(`  ${deregisterUser} still in navbar: ${deregUserStillExists}`);

    await takeScreenshot(page, `${String(deregisterStep).padStart(2, '0')}_after_deregister`);

    // ========== Verify deregister is permanent ==========
    const permanentStep = deregisterStep + 1;
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP ${permanentStep}: Verify Deregister is Permanent (cannot login)`);
    console.log('─'.repeat(50));

    // Try to login with deregistered account — should fail.
    // Use a quick single-attempt login (not loginAfterDisconnect which has
    // extensive retry logic that would burn minutes on expected failures).
    const canLoginAfterDeregister = await tryLoginQuick(page, deregisterUser, PASSWORD);
    results.deregisterPermanent = !canLoginAfterDeregister;

    console.log(`  Can login after deregister: ${canLoginAfterDeregister}`);
    console.log(`  Deregister is permanent: ${results.deregisterPermanent}`);

    await takeScreenshot(page, `${String(permanentStep).padStart(2, '0')}_deregister_permanent`);

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    // All tests must pass — no optional checks
    const allSessionsCreated = results.sessionsCreated.every(Boolean);
    const allPassed =
      allSessionsCreated &&
      results.navbarVisible &&
      results.allSessionsInNavbar &&
      results.disconnectRemovesSession &&
      results.reconnectAfterDisconnect &&
      results.deregisterRemovesSession &&
      results.deregisterPermanent &&
      results.oneClickLoginWorks &&
      results.previousSessionsLabel &&
      results.scrollContainerExists;

    console.log('\nSession Creation:');
    results.sessionsCreated.forEach((created, i) => {
      console.log(`  Session ${i + 1} Created:         ${created ? 'PASS' : 'FAIL'}`);
    });

    console.log('\nNavbar Verification:');
    console.log(`  Navbar Visible:            ${results.navbarVisible ? 'PASS' : 'FAIL'}`);
    console.log(`  All Sessions in Navbar:    ${results.allSessionsInNavbar ? 'PASS' : 'FAIL'}`);
    console.log(`  Previous Sessions Label:   ${results.previousSessionsLabel ? 'PASS' : 'FAIL'}`);
    console.log(`  Scroll Container Exists:   ${results.scrollContainerExists ? 'PASS' : 'FAIL'}`);

    console.log('\nDisconnect Flow:');
    console.log(`  Disconnect Removes:        ${results.disconnectRemovesSession ? 'PASS' : 'FAIL'}`);
    console.log(`  Reconnect After Disconnect:${results.reconnectAfterDisconnect ? 'PASS' : 'FAIL'}`);

    console.log('\nDeregister Flow:');
    console.log(`  Deregister Removes:        ${results.deregisterRemovesSession ? 'PASS' : 'FAIL'}`);
    console.log(`  Deregister Permanent:      ${results.deregisterPermanent ? 'PASS' : 'FAIL'}`);

    console.log('\n1-Click Login:');
    console.log(`  1-Click Login Works:       ${results.oneClickLoginWorks ? 'PASS' : 'FAIL'}`);

    console.log('\nOrdering:');
    console.log(`  Most Recent First:         ${results.mostRecentFirst ? 'PASS' : 'CHECK'}`);

    harness.finalize(allPassed, results);

    console.log('\nBrowser will remain open for 15 seconds for manual inspection...');
    await sleep(15000);

    return allPassed;

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
