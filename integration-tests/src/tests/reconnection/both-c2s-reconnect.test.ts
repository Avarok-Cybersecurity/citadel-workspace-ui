/**
 * Both C2S Reconnection Test
 *
 * Tests both users C2S disconnect:
 * 1. Create 2 accounts with P2P connection
 * 2. disconnectViaTopBar(user1) - User1 explicit logout
 * 3. disconnectViaTopBar(user2) - User2 explicit logout
 * 4. Neither in OrphanSessionsNavbar (explicit logout removes session)
 * 5. loginAfterDisconnect(user1) + loginAfterDisconnect(user2)
 * 6. Verify P2P auto-reconnects via p2pAutoConnectService
 * 7. Verify messaging works
 *
 * Key insight: Registration is ONE-TIME and persists in SDK backend.
 * After re-login, p2pAutoConnectService automatically establishes new P2P
 * connections (new ratchets) with previously registered peers.
 */

import type { Page, Browser } from 'playwright';
import {
  sleep,
  createSeparateBrowsers,
  ensureScreenshotsDir,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  disconnectViaTopBar,
  assertSessionNotInOrphanNavbar,
  loginAfterDisconnect,
  sendMessage,
  verifyMessageReceived,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  setupConsoleCapture,
  logObservation,
  UxIssueTracker,
  config,
} from '../../lib/index.js';

// Test configuration
const timestamp = Date.now();
const USER1_NAME = `bothc2s_1_${timestamp}`;
const USER2_NAME = `bothc2s_2_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  notes: string;
}

async function runTest(): Promise<boolean> {
  console.log('=== Both C2S Reconnection Test ===');
  console.log(`Timestamp: ${timestamp}`);
  console.log(`User1: ${USER1_NAME}`);
  console.log(`User2: ${USER2_NAME}`);
  console.log(`Server: ${config.WORKSPACE_SERVER}`);
  console.log('');

  const results: TestResult[] = [];
  const uxTracker = new UxIssueTracker();
  let browser1: Browser | null = null;
  let browser2: Browser | null = null;
  let page1: Page | null = null;
  let page2: Page | null = null;
  const consoleErrors: string[] = [];

  try {
    ensureScreenshotsDir();

    console.log('Waiting for services to be alive...');
    const servicesAlive = await waitForServicesAlive();
    if (!servicesAlive) {
      results.push({
        step: 'Services Check',
        status: 'FAIL',
        notes: 'Services not responding',
      });
      return false;
    }

    const browserSetup = await createSeparateBrowsers(2, { headless: false, slowMo: 50 });
    browser1 = browserSetup.browsers[0];
    browser2 = browserSetup.browsers[1];
    page1 = browserSetup.pages[0];
    page2 = browserSetup.pages[1];

    const errorPatterns = ['Session Already Connected', 'Ratchet does not exist', 'ratchet v'];

    setupConsoleCapture(page1, USER1_NAME, errorPatterns);
    setupConsoleCapture(page2, USER2_NAME, errorPatterns);

    const trackErrors = (page: Page, username: string) => {
      page.on('console', (msg) => {
        const text = msg.text();
        if (errorPatterns.some(pattern => text.includes(pattern))) {
          consoleErrors.push(`[${username}] ${text}`);
          console.log(`[CONSOLE ERROR] [${username}] ${text}`);
          uxTracker.log('critical', 'functional', text);
        }
      });
    };

    trackErrors(page1, USER1_NAME);
    trackErrors(page2, USER2_NAME);

    // ===== PHASE 1: Create Accounts =====
    console.log('\n=== Phase 1: Create Accounts ===');
    logObservation('setup', 'Creating accounts', { user1: USER1_NAME, user2: USER2_NAME }, 'investigating');

    const user1Created = await createAccount(page1, USER1_NAME, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });

    results.push({
      step: 'Phase 1a: Create User1',
      status: user1Created ? 'PASS' : 'FAIL',
      notes: user1Created ? `Created ${USER1_NAME}` : 'Failed',
    });

    if (!user1Created) return false;
    await sleep(3000);

    const user2Created = await createAccount(page2, USER2_NAME, {
      isFirstUser: false,
      password: PASSWORD,
      uxTracker,
    });

    results.push({
      step: 'Phase 1b: Create User2',
      status: user2Created ? 'PASS' : 'FAIL',
      notes: user2Created ? `Created ${USER2_NAME}` : 'Failed',
    });

    if (!user2Created) return false;
    await sleep(2000);

    // ===== PHASE 2: Initial P2P Registration =====
    console.log('\n=== Phase 2: Initial P2P Registration ===');

    const p2pRequested = await p2pRegister(page1, USER1_NAME, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 2a: P2P Register',
      status: p2pRequested ? 'PASS' : 'FAIL',
      notes: p2pRequested ? 'Initiated' : 'Failed',
    });

    if (!p2pRequested) return false;
    await sleep(3000);

    const p2pAccepted = await acceptP2PRequest(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 2b: P2P Accept',
      status: p2pAccepted ? 'PASS' : 'FAIL',
      notes: p2pAccepted ? 'Accepted' : 'Failed',
    });

    if (!p2pAccepted) return false;
    await sleep(3000);

    // Verify initial messaging works
    await openConversation(page1, USER1_NAME, USER2_NAME, uxTracker);
    await openConversation(page2, USER2_NAME, USER1_NAME, uxTracker);

    const msg1 = `Initial from ${USER1_NAME} - ${Date.now()}`;
    const msg1Sent = await sendMessage(page1, USER1_NAME, msg1, uxTracker);
    if (msg1Sent) {
      await sleep(3000);
      await verifyMessageReceived(page2, USER2_NAME, msg1, 30000, uxTracker);
    }

    results.push({
      step: 'Phase 2c: Initial Messaging',
      status: msg1Sent ? 'PASS' : 'FAIL',
      notes: msg1Sent ? 'Works' : 'Failed',
    });

    await takeScreenshot(page1, `${USER1_NAME}_phase2_p2p_established`);
    await takeScreenshot(page2, `${USER2_NAME}_phase2_p2p_established`);

    // ===== PHASE 3: Both Users Logout =====
    console.log('\n=== Phase 3: Both Users Logout ===');

    // User1 logout
    const user1LoggedOut = await disconnectViaTopBar(page1, USER1_NAME, uxTracker);
    results.push({
      step: 'Phase 3a: User1 Sign Out',
      status: user1LoggedOut ? 'PASS' : 'FAIL',
      notes: user1LoggedOut ? 'Signed out' : 'Failed',
    });

    await sleep(2000);

    // User2 logout
    const user2LoggedOut = await disconnectViaTopBar(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 3b: User2 Sign Out',
      status: user2LoggedOut ? 'PASS' : 'FAIL',
      notes: user2LoggedOut ? 'Signed out' : 'Failed',
    });

    await sleep(2000);
    await takeScreenshot(page1, `${USER1_NAME}_phase3_logged_out`);
    await takeScreenshot(page2, `${USER2_NAME}_phase3_logged_out`);

    // ===== PHASE 4: Verify Neither Orphaned =====
    console.log('\n=== Phase 4: Verify Neither Orphaned ===');

    const user1NotOrphaned = await assertSessionNotInOrphanNavbar(page1, USER1_NAME, uxTracker);
    const user2NotOrphaned = await assertSessionNotInOrphanNavbar(page2, USER2_NAME, uxTracker);

    results.push({
      step: 'Phase 4: Neither Session Orphaned',
      status: user1NotOrphaned && user2NotOrphaned ? 'PASS' : 'FAIL',
      notes: `User1: ${user1NotOrphaned ? 'not orphaned' : 'orphaned'}, User2: ${user2NotOrphaned ? 'not orphaned' : 'orphaned'}`,
    });

    // ===== PHASE 5: Both Users Login Again =====
    console.log('\n=== Phase 5: Both Users Login Again ===');

    const user1LoggedIn = await loginAfterDisconnect(
      page1,
      USER1_NAME,
      PASSWORD,
      uxTracker,
      config.WORKSPACE_SERVER
    );

    results.push({
      step: 'Phase 5a: User1 Login',
      status: user1LoggedIn ? 'PASS' : 'FAIL',
      notes: user1LoggedIn ? 'Logged in' : 'Failed',
    });

    if (!user1LoggedIn) return false;
    await sleep(3000);

    const user2LoggedIn = await loginAfterDisconnect(
      page2,
      USER2_NAME,
      PASSWORD,
      uxTracker,
      config.WORKSPACE_SERVER
    );

    results.push({
      step: 'Phase 5b: User2 Login',
      status: user2LoggedIn ? 'PASS' : 'FAIL',
      notes: user2LoggedIn ? 'Logged in' : 'Failed',
    });

    if (!user2LoggedIn) return false;
    await sleep(3000);

    await takeScreenshot(page1, `${USER1_NAME}_phase5_logged_in`);
    await takeScreenshot(page2, `${USER2_NAME}_phase5_logged_in`);

    // ===== PHASE 6: Verify P2P Auto-Connected =====
    console.log('\n=== Phase 6: Verify P2P Auto-Connected ===');
    console.log('  (Registration persists in SDK backend - auto-connect creates new ratchets)');

    // Wait for p2pAutoConnectService to reconnect peers
    await sleep(5000);

    // Verify peer appears in sidebar for both users
    const user1SeesUser2 = await page1.locator(`text="${USER2_NAME}"`).first()
      .isVisible({ timeout: 10000 }).catch(() => false);
    const user2SeesUser1 = await page2.locator(`text="${USER1_NAME}"`).first()
      .isVisible({ timeout: 10000 }).catch(() => false);

    results.push({
      step: 'Phase 6: P2P Auto-Connected',
      status: user1SeesUser2 && user2SeesUser1 ? 'PASS' : 'FAIL',
      notes: `User1 sees User2: ${user1SeesUser2}, User2 sees User1: ${user2SeesUser1}`,
    });

    await takeScreenshot(page1, `${USER1_NAME}_phase6_auto_connected`);
    await takeScreenshot(page2, `${USER2_NAME}_phase6_auto_connected`);

    // ===== PHASE 7: Verify Messaging After Reconnect =====
    console.log('\n=== Phase 7: Verify Messaging After Reconnect ===');

    // Open conversations
    await openConversation(page1, USER1_NAME, USER2_NAME, uxTracker);
    await openConversation(page2, USER2_NAME, USER1_NAME, uxTracker);

    // Send message
    const msg2 = `After reconnect from ${USER1_NAME} - ${Date.now()}`;
    const msg2Sent = await sendMessage(page1, USER1_NAME, msg2, uxTracker);

    results.push({
      step: 'Phase 7a: Send Message',
      status: msg2Sent ? 'PASS' : 'FAIL',
      notes: msg2Sent ? 'Sent' : 'Failed',
    });

    if (msg2Sent) {
      await sleep(3000);
      const msg2Received = await verifyMessageReceived(page2, USER2_NAME, msg2, 30000, uxTracker);
      results.push({
        step: 'Phase 7b: Verify Received',
        status: msg2Received ? 'PASS' : 'FAIL',
        notes: msg2Received ? 'Received' : 'Not received',
      });
    }

    await takeScreenshot(page1, `${USER1_NAME}_phase7_msg_sent`);
    await takeScreenshot(page2, `${USER2_NAME}_phase7_msg_received`);

    // ===== PHASE 8: Verify No Session Errors =====
    console.log('\n=== Phase 8: Verify No Session Errors ===');

    const hasSessionErrors = consoleErrors.some((e) => e.includes('Session Already Connected'));
    const hasRatchetErrors = consoleErrors.some(
      (e) => e.includes('Ratchet does not exist') || e.includes('ratchet v')
    );

    results.push({
      step: 'Phase 8a: No Session Errors',
      status: !hasSessionErrors ? 'PASS' : 'FAIL',
      notes: !hasSessionErrors ? 'None' : 'Found session errors',
    });

    results.push({
      step: 'Phase 8b: No Ratchet Errors',
      status: !hasRatchetErrors ? 'PASS' : 'FAIL',
      notes: !hasRatchetErrors ? 'None' : 'Found ratchet errors',
    });

    // Print and write results
    printResults(results);

    if (consoleErrors.length > 0) {
      console.log('\n=== Console Errors Detected ===');
      for (const error of consoleErrors) {
        console.log(`  ${error}`);
      }
    }

    writeTestReport('both-c2s-reconnect-test.json', {
      testName: 'Both C2S Reconnection Test',
      users: { user1: USER1_NAME, user2: USER2_NAME },
      results,
      uxIssues: uxTracker.getIssues(),
      consoleErrors,
      passed: results.every((r) => r.status === 'PASS' || r.status === 'SKIP'),
    });

    const allPassed = results.every((r) => r.status === 'PASS' || r.status === 'SKIP');
    console.log(allPassed ? '\n✅ Both C2S Reconnection Test PASSED' : '\n❌ Both C2S Reconnection Test FAILED');

    return allPassed;
  } catch (error) {
    console.error('Test failed with error:', error);
    results.push({
      step: 'Test Execution',
      status: 'FAIL',
      notes: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });

    if (page1) await takeScreenshot(page1, `${USER1_NAME}_error`);
    if (page2) await takeScreenshot(page2, `${USER2_NAME}_error`);

    printResults(results);
    return false;
  } finally {
    if (browser1) await browser1.close();
    if (browser2) await browser2.close();
  }
}

function printResults(results: TestResult[]): void {
  console.log('\n=== Test Results ===');
  console.log('─'.repeat(80));

  for (const result of results) {
    const statusIcon =
      result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${statusIcon} ${result.step}`);
    console.log(`   ${result.notes}`);
  }

  console.log('─'.repeat(80));

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
}

runTest()
  .then((passed) => process.exit(passed ? 0 : 1))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
