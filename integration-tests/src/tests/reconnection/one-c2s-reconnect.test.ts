/**
 * One C2S Reconnection Test
 *
 * Tests P2P disconnect then ONE user C2S logout:
 * 1. Create 2 accounts with P2P connection
 * 2. disconnectP2P(user2, user1) - P2P disconnects
 * 3. disconnectViaTopBar(user1) - User1 C2S explicit logout
 * 4. Verify user1 NOT in OrphanSessionsNavbar (explicit = removed)
 * 5. loginAfterDisconnect(user1) - User1 logs back in
 * 6. connectP2P(user1, user2) - Reconnect P2P
 * 7. Verify messaging works
 *
 * Key insight: After explicit logout, user1's ratchets may be destroyed,
 * so we test if P2P reconnection works after C2S reconnect.
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
  connectP2P,
  disconnectP2P,
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
const USER1_NAME = `onec2s_1_${timestamp}`;
const USER2_NAME = `onec2s_2_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  notes: string;
}

async function runTest(): Promise<boolean> {
  console.log('=== One C2S Reconnection Test ===');
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

    // Wait for services
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

    // Create separate browsers for each user
    const browserSetup = await createSeparateBrowsers(2, { headless: false, slowMo: 50 });
    browser1 = browserSetup.browsers[0];
    browser2 = browserSetup.browsers[1];
    page1 = browserSetup.pages[0];
    page2 = browserSetup.pages[1];

    // Setup console capture for ratchet errors
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
      step: 'Phase 1a: Create User1 (initializer)',
      status: user1Created ? 'PASS' : 'FAIL',
      notes: user1Created ? `Created ${USER1_NAME}` : 'Failed to create user1',
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
      notes: user2Created ? `Created ${USER2_NAME}` : 'Failed to create user2',
    });

    if (!user2Created) return false;
    await sleep(2000);

    // ===== PHASE 2: P2P Registration =====
    console.log('\n=== Phase 2: P2P Registration ===');

    const p2pRequested = await p2pRegister(page1, USER1_NAME, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 2a: P2P Register Request',
      status: p2pRequested ? 'PASS' : 'FAIL',
      notes: p2pRequested ? 'P2P registration initiated' : 'Failed',
    });

    if (!p2pRequested) return false;
    await sleep(3000);

    const p2pAccepted = await acceptP2PRequest(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 2b: P2P Accept',
      status: p2pAccepted ? 'PASS' : 'FAIL',
      notes: p2pAccepted ? 'P2P registration accepted' : 'Failed',
    });

    if (!p2pAccepted) return false;
    await sleep(3000);

    // Open conversations
    await openConversation(page1, USER1_NAME, USER2_NAME, uxTracker);
    await openConversation(page2, USER2_NAME, USER1_NAME, uxTracker);

    // Send initial message
    const msg1 = `Initial message from ${USER1_NAME} - ${Date.now()}`;
    const msg1Sent = await sendMessage(page1, USER1_NAME, msg1, uxTracker);
    if (msg1Sent) {
      await sleep(3000);
      await verifyMessageReceived(page2, USER2_NAME, msg1, 30000, uxTracker);
    }

    await takeScreenshot(page1, `${USER1_NAME}_phase2_p2p_established`);
    await takeScreenshot(page2, `${USER2_NAME}_phase2_p2p_established`);

    results.push({
      step: 'Phase 2c: Initial Message',
      status: msg1Sent ? 'PASS' : 'FAIL',
      notes: msg1Sent ? 'Initial messaging works' : 'Failed',
    });

    // ===== PHASE 3: Disconnect P2P =====
    console.log('\n=== Phase 3: Disconnect P2P ===');

    const p2pDisconnected = await disconnectP2P(page2, USER2_NAME, USER1_NAME, uxTracker);
    results.push({
      step: 'Phase 3: P2P Disconnect',
      status: p2pDisconnected ? 'PASS' : 'FAIL',
      notes: p2pDisconnected ? 'P2P disconnected' : 'Failed',
    });

    await sleep(2000);

    // ===== PHASE 4: User1 C2S Explicit Logout =====
    console.log('\n=== Phase 4: User1 C2S Explicit Logout ===');

    const user1LoggedOut = await disconnectViaTopBar(page1, USER1_NAME, uxTracker);
    results.push({
      step: 'Phase 4a: User1 Sign Out',
      status: user1LoggedOut ? 'PASS' : 'FAIL',
      notes: user1LoggedOut ? 'User1 signed out' : 'Failed',
    });

    if (!user1LoggedOut) {
      console.error('User1 logout failed');
      // Continue anyway to see what happens
    }

    await sleep(2000);
    await takeScreenshot(page1, `${USER1_NAME}_phase4_logged_out`);

    // Verify user1 NOT in OrphanSessionsNavbar (explicit disconnect removes session)
    const notOrphaned = await assertSessionNotInOrphanNavbar(page1, USER1_NAME, uxTracker);
    results.push({
      step: 'Phase 4b: User1 NOT Orphaned',
      status: notOrphaned ? 'PASS' : 'FAIL',
      notes: notOrphaned
        ? 'Session correctly NOT in OrphanSessionsNavbar'
        : 'Session unexpectedly found in OrphanSessionsNavbar',
    });

    // ===== PHASE 5: User1 Login Again =====
    console.log('\n=== Phase 5: User1 Login Again ===');

    const user1LoggedIn = await loginAfterDisconnect(
      page1,
      USER1_NAME,
      PASSWORD,
      uxTracker,
      config.WORKSPACE_SERVER
    );

    results.push({
      step: 'Phase 5: User1 Login',
      status: user1LoggedIn ? 'PASS' : 'FAIL',
      notes: user1LoggedIn ? 'User1 logged back in' : 'Failed to login',
    });

    if (!user1LoggedIn) {
      console.error('User1 login failed');
      return false;
    }

    await sleep(3000);
    await takeScreenshot(page1, `${USER1_NAME}_phase5_logged_in`);

    // ===== PHASE 6: Reconnect P2P =====
    console.log('\n=== Phase 6: Reconnect P2P ===');

    // User1 reconnects P2P with User2
    const p2pReconnected = await connectP2P(page1, USER1_NAME, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 6: P2P Reconnect',
      status: p2pReconnected ? 'PASS' : 'FAIL',
      notes: p2pReconnected ? 'P2P reconnected' : 'Failed',
    });

    await sleep(3000);
    await takeScreenshot(page1, `${USER1_NAME}_phase6_p2p_reconnected`);
    await takeScreenshot(page2, `${USER2_NAME}_phase6_p2p_reconnected`);

    // ===== PHASE 7: Verify Messaging After Reconnect =====
    console.log('\n=== Phase 7: Verify Messaging After Reconnect ===');

    // Reopen conversations
    await openConversation(page1, USER1_NAME, USER2_NAME, uxTracker);
    await openConversation(page2, USER2_NAME, USER1_NAME, uxTracker);

    // Send message from user1 (the one who reconnected) to user2
    const msg2 = `Message after reconnect from ${USER1_NAME} - ${Date.now()}`;
    const msg2Sent = await sendMessage(page1, USER1_NAME, msg2, uxTracker);

    results.push({
      step: 'Phase 7a: Send Message After Reconnect',
      status: msg2Sent ? 'PASS' : 'FAIL',
      notes: msg2Sent ? 'Message sent' : 'Failed to send',
    });

    if (msg2Sent) {
      await sleep(3000);
      const msg2Received = await verifyMessageReceived(page2, USER2_NAME, msg2, 30000, uxTracker);
      results.push({
        step: 'Phase 7b: Verify Message Received',
        status: msg2Received ? 'PASS' : 'FAIL',
        notes: msg2Received ? 'Message received' : 'Not received',
      });
    }

    await takeScreenshot(page1, `${USER1_NAME}_phase7_msg_sent`);
    await takeScreenshot(page2, `${USER2_NAME}_phase7_msg_received`);

    // ===== PHASE 8: Verify No Ratchet Errors =====
    console.log('\n=== Phase 8: Verify No Ratchet Errors ===');

    const hasRatchetErrors = consoleErrors.some(
      (e) => e.includes('Ratchet does not exist') || e.includes('ratchet v')
    );

    results.push({
      step: 'Phase 8: No Ratchet Errors',
      status: !hasRatchetErrors ? 'PASS' : 'FAIL',
      notes: !hasRatchetErrors
        ? 'No ratchet errors detected'
        : `Found ratchet errors`,
    });

    // Print and write results
    printResults(results);

    if (consoleErrors.length > 0) {
      console.log('\n=== Console Errors Detected ===');
      for (const error of consoleErrors) {
        console.log(`  ${error}`);
      }
    }

    writeTestReport('one-c2s-reconnect-test.json', {
      testName: 'One C2S Reconnection Test',
      users: { user1: USER1_NAME, user2: USER2_NAME },
      results,
      uxIssues: uxTracker.getIssues(),
      consoleErrors,
      passed: results.every((r) => r.status === 'PASS' || r.status === 'SKIP'),
    });

    const allPassed = results.every((r) => r.status === 'PASS' || r.status === 'SKIP');
    console.log(allPassed ? '\n✅ One C2S Reconnection Test PASSED' : '\n❌ One C2S Reconnection Test FAILED');

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
