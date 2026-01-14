/**
 * P2P + One C2S Reconnection Test
 *
 * Tests mixed scenario: TCP drop (orphans session, preserves ratchets) + explicit disconnect:
 * 1. Create 2 accounts with P2P connection
 * 2. disconnectViaTcpDrop(user2) - TCP drop (orphans session, preserves P2P ratchets)
 * 3. Verify user2 IS in OrphanSessionsNavbar
 * 4. disconnectViaTopBar(user1) - User1 explicit logout (destroys ratchets)
 * 5. reconnectViaClaimSession(user2) - User2 reclaims orphaned session
 * 6. loginAfterDisconnect(user1) - User1 fresh login
 * 7. P2P must re-register (user1's ratchets destroyed)
 * 8. Verify messaging works
 *
 * Key insight: This tests the mixed case where:
 * - TCP drop preserves P2P ratchets (user2 can resume)
 * - Explicit disconnect destroys ratchets (user1 must re-register)
 * - After user1 re-registers, both can communicate again
 */

import type { Page, Browser, BrowserContext } from 'playwright';
import {
  sleep,
  createSeparateBrowsers,
  ensureScreenshotsDir,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  disconnectViaTcpDrop,
  disconnectViaTopBar,
  assertSessionInOrphanNavbar,
  assertSessionNotInOrphanNavbar,
  reconnectViaClaimSession,
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
const USER1_NAME = `p2pc2s_1_${timestamp}`;
const USER2_NAME = `p2pc2s_2_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  notes: string;
}

async function runTest(): Promise<boolean> {
  console.log('=== P2P + One C2S Reconnection Test ===');
  console.log(`Timestamp: ${timestamp}`);
  console.log(`User1: ${USER1_NAME}`);
  console.log(`User2: ${USER2_NAME}`);
  console.log(`Server: ${config.WORKSPACE_SERVER}`);
  console.log('');

  const results: TestResult[] = [];
  const uxTracker = new UxIssueTracker();
  let browser1: Browser | null = null;
  let browser2: Browser | null = null;
  let context2: BrowserContext | null = null;
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

    const browserSetup = await createSeparateBrowsers(2);
    browser1 = browserSetup.browsers[0];
    browser2 = browserSetup.browsers[1];
    page1 = browserSetup.pages[0];
    page2 = browserSetup.pages[1];
    // Store context2 for creating new pages later (after TCP drop simulation)
    context2 = page2.context();

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

    // ===== PHASE 2: P2P Registration =====
    console.log('\n=== Phase 2: P2P Registration ===');

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

    // Verify initial messaging
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

    // ===== PHASE 3: User2 TCP Drop (Orphans Session) =====
    console.log('\n=== Phase 3: User2 TCP Drop (Orphans Session) ===');

    // Save reference to browser2 context for later
    // We need to create a new page after TCP drop
    const user2TcpDropped = await disconnectViaTcpDrop(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 3: User2 TCP Drop',
      status: user2TcpDropped ? 'PASS' : 'FAIL',
      notes: user2TcpDropped ? 'Page closed (TCP drop simulated)' : 'Failed',
    });

    await sleep(3000);

    // ===== PHASE 4: Verify User2 IS Orphaned (from User1's browser) =====
    console.log('\n=== Phase 4: Verify User2 IS Orphaned ===');

    // Navigate user1 to landing page to check for user2's orphan session
    // We need to use user1's page since user2's page is closed
    const configModule = await import('../../lib/config.js');
    await page1.goto(configModule.config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await sleep(3000);

    // Note: We can't directly check user2's orphan status from user1's browser
    // because orphan sessions are per-browser. Instead, we'll create a new page
    // for user2 to check from.

    // Create new page for user2 in browser2
    if (!context2) {
      throw new Error('context2 is null - cannot create new page for user2');
    }
    page2 = await context2.newPage();
    trackErrors(page2, USER2_NAME);

    // User2 should see their orphaned session on landing page
    const user2IsOrphaned = await assertSessionInOrphanNavbar(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 4: User2 IS Orphaned',
      status: user2IsOrphaned ? 'PASS' : 'FAIL',
      notes: user2IsOrphaned
        ? 'Session correctly in OrphanSessionsNavbar (TCP drop preserved it)'
        : 'Session NOT in OrphanSessionsNavbar (unexpected)',
    });

    await takeScreenshot(page2, `${USER2_NAME}_phase4_orphaned`);

    // ===== PHASE 5: User1 Explicit Logout (Destroys Ratchets) =====
    console.log('\n=== Phase 5: User1 Explicit Logout (Destroys Ratchets) ===');

    // First go back to workspace for user1
    await page1.goto(`${configModule.config.BASE_URL}/workspace`, { waitUntil: 'commit', timeout: 30000 });
    await sleep(2000);

    const user1LoggedOut = await disconnectViaTopBar(page1, USER1_NAME, uxTracker);
    results.push({
      step: 'Phase 5a: User1 Sign Out',
      status: user1LoggedOut ? 'PASS' : 'FAIL',
      notes: user1LoggedOut ? 'Signed out (ratchets destroyed)' : 'Failed',
    });

    await sleep(2000);

    // Verify user1 NOT orphaned (explicit disconnect removes session)
    const user1NotOrphaned = await assertSessionNotInOrphanNavbar(page1, USER1_NAME, uxTracker);
    results.push({
      step: 'Phase 5b: User1 NOT Orphaned',
      status: user1NotOrphaned ? 'PASS' : 'FAIL',
      notes: user1NotOrphaned ? 'Session correctly removed' : 'Unexpected orphan',
    });

    await takeScreenshot(page1, `${USER1_NAME}_phase5_logged_out`);

    // ===== PHASE 6: User2 Claims Orphaned Session =====
    console.log('\n=== Phase 6: User2 Claims Orphaned Session ===');

    const user2Claimed = await reconnectViaClaimSession(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 6: User2 ClaimSession',
      status: user2Claimed ? 'PASS' : 'FAIL',
      notes: user2Claimed ? 'Session reclaimed' : 'Failed',
    });

    await sleep(3000);
    await takeScreenshot(page2, `${USER2_NAME}_phase6_claimed`);

    // ===== PHASE 7: User1 Fresh Login =====
    console.log('\n=== Phase 7: User1 Fresh Login ===');

    const user1LoggedIn = await loginAfterDisconnect(
      page1,
      USER1_NAME,
      PASSWORD,
      uxTracker,
      config.WORKSPACE_SERVER
    );

    results.push({
      step: 'Phase 7: User1 Login',
      status: user1LoggedIn ? 'PASS' : 'FAIL',
      notes: user1LoggedIn ? 'Logged in' : 'Failed',
    });

    if (!user1LoggedIn) return false;
    await sleep(3000);
    await takeScreenshot(page1, `${USER1_NAME}_phase7_logged_in`);

    // ===== PHASE 8: Re-register P2P (User1's ratchets were destroyed) =====
    console.log('\n=== Phase 8: Re-register P2P ===');
    console.log('  (User1 ratchets destroyed by explicit disconnect)');

    // User1 initiates new P2P registration
    const p2pReRequested = await p2pRegister(page1, USER1_NAME, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 8a: P2P Re-register',
      status: p2pReRequested ? 'PASS' : 'FAIL',
      notes: p2pReRequested ? 'Initiated' : 'Failed',
    });

    if (!p2pReRequested) {
      console.error('P2P re-registration request failed');
    }

    await sleep(3000);

    // User2 accepts
    const p2pReAccepted = await acceptP2PRequest(page2, USER2_NAME, uxTracker);
    results.push({
      step: 'Phase 8b: P2P Re-accept',
      status: p2pReAccepted ? 'PASS' : 'FAIL',
      notes: p2pReAccepted ? 'Accepted' : 'Failed',
    });

    await sleep(3000);
    await takeScreenshot(page1, `${USER1_NAME}_phase8_p2p_reregistered`);
    await takeScreenshot(page2, `${USER2_NAME}_phase8_p2p_reregistered`);

    // ===== PHASE 9: Verify Messaging Works =====
    console.log('\n=== Phase 9: Verify Messaging Works ===');

    await openConversation(page1, USER1_NAME, USER2_NAME, uxTracker);
    await openConversation(page2, USER2_NAME, USER1_NAME, uxTracker);

    const msg2 = `After mixed reconnect from ${USER1_NAME} - ${Date.now()}`;
    const msg2Sent = await sendMessage(page1, USER1_NAME, msg2, uxTracker);

    results.push({
      step: 'Phase 9a: Send Message',
      status: msg2Sent ? 'PASS' : 'FAIL',
      notes: msg2Sent ? 'Sent' : 'Failed',
    });

    if (msg2Sent) {
      await sleep(3000);
      const msg2Received = await verifyMessageReceived(page2, USER2_NAME, msg2, 30000, uxTracker);
      results.push({
        step: 'Phase 9b: Verify Received',
        status: msg2Received ? 'PASS' : 'FAIL',
        notes: msg2Received ? 'Received' : 'Not received',
      });
    }

    // Also test reverse direction
    const msg3 = `Reply from ${USER2_NAME} - ${Date.now()}`;
    const msg3Sent = await sendMessage(page2, USER2_NAME, msg3, uxTracker);

    if (msg3Sent) {
      await sleep(3000);
      const msg3Received = await verifyMessageReceived(page1, USER1_NAME, msg3, 30000, uxTracker);
      results.push({
        step: 'Phase 9c: Bidirectional Messaging',
        status: msg3Received ? 'PASS' : 'FAIL',
        notes: msg3Received ? 'Works both ways' : 'One direction only',
      });
    }

    await takeScreenshot(page1, `${USER1_NAME}_phase9_messaging`);
    await takeScreenshot(page2, `${USER2_NAME}_phase9_messaging`);

    // ===== PHASE 10: Verify No Critical Errors =====
    console.log('\n=== Phase 10: Verify No Critical Errors ===');

    const hasSessionErrors = consoleErrors.some((e) => e.includes('Session Already Connected'));
    const hasRatchetErrors = consoleErrors.some(
      (e) => e.includes('Ratchet does not exist') || e.includes('ratchet v')
    );

    results.push({
      step: 'Phase 10a: No Session Errors',
      status: !hasSessionErrors ? 'PASS' : 'FAIL',
      notes: !hasSessionErrors ? 'None' : 'Found session errors',
    });

    results.push({
      step: 'Phase 10b: No Ratchet Errors',
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

    writeTestReport('p2p-one-c2s-reconnect-test.json', {
      testName: 'P2P + One C2S Reconnection Test',
      users: { user1: USER1_NAME, user2: USER2_NAME },
      results,
      uxIssues: uxTracker.getIssues(),
      consoleErrors,
      passed: results.every((r) => r.status === 'PASS' || r.status === 'SKIP'),
    });

    const allPassed = results.every((r) => r.status === 'PASS' || r.status === 'SKIP');
    console.log(allPassed ? '\n✅ P2P + One C2S Reconnection Test PASSED' : '\n❌ P2P + One C2S Reconnection Test FAILED');

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
