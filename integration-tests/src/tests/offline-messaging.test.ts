/**
 * Offline Messaging Test
 *
 * Tests the P2P messaging + ILM (Intersession Layer Messaging) system.
 * Based on the working P2P messaging test, extended with offline scenarios.
 *
 * Test Flow:
 * 1. Create two users in separate browser processes
 * 2. P2P register User1 -> User2
 * 3. User2 accepts the P2P request
 * 4. Test bidirectional messaging (verify P2P works)
 * 5. User2 disconnects via TCP drop (page close - session orphaned)
 * 6. Assert User2 IS in OrphanSessionsNavbar
 * 7. User1 sends messages while User2 is offline (ILM queues them)
 * 8. User2 reconnects via ClaimSession
 * 9. Verify User2 received all offline messages
 * 10. Exchange post-reconnect messages
 */

import {
  sleep,
  createSeparateBrowsers,
  ensureScreenshotsDir,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  sendMessage,
  verifyMessageReceived,
  disconnectViaTcpDrop,
  assertSessionInOrphanNavbar,
  reconnectViaClaimSession,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  setupConsoleCapture,
  logObservation,
  UxIssueTracker,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: {
    user1: boolean;
    user2: boolean;
  };
  p2pRegistration: boolean;
  p2pAccept: boolean;
  conversationOpen: {
    user1: boolean;
    user2: boolean;
  };
  initialMessaging: {
    user1ToUser2: boolean;
    user2ToUser1: boolean;
    user1Received: boolean;
    user2Received: boolean;
  };
  disconnection: {
    user2Disconnected: boolean;
    sessionOrphaned: boolean;
  };
  offlineMessages: {
    message1Sent: boolean;
    message2Sent: boolean;
    message3Sent: boolean;
  };
  reconnection: {
    user2Reconnected: boolean;
    claimSessionSuccess: boolean;
  };
  offlineDelivery: {
    message1Received: boolean;
    message2Received: boolean;
    message3Received: boolean;
  };
  postReconnectMessaging: {
    user1ToUser2: boolean;
    user2ToUser1: boolean;
    user1Received: boolean;
    user2Received: boolean;
  };
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `offline_alice_${timestamp}`;
const USER2 = `offline_bob_${timestamp}`;

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('OFFLINE MESSAGING TEST');
  console.log('='.repeat(60));
  console.log(`User 1 (Alice): ${USER1}`);
  console.log(`User 2 (Bob): ${USER2}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Wait for services
  await waitForServicesAlive();

  logObservation('test-start', 'Offline Messaging Test Started', {
    user1: USER1,
    user2: USER2,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Use SEPARATE browser processes to eliminate Chrome tab throttling
  const { browsers, pages: [page1, page2], cleanup } = await createSeparateBrowsers(2, {
    headless: false,
    slowMo: 50,
  });

  const results: TestResults = {
    accountCreation: { user1: false, user2: false },
    p2pRegistration: false,
    p2pAccept: false,
    conversationOpen: { user1: false, user2: false },
    initialMessaging: {
      user1ToUser2: false,
      user2ToUser1: false,
      user1Received: false,
      user2Received: false,
    },
    disconnection: {
      user2Disconnected: false,
      sessionOrphaned: false,
    },
    offlineMessages: {
      message1Sent: false,
      message2Sent: false,
      message3Sent: false,
    },
    reconnection: {
      user2Reconnected: false,
      claimSessionSuccess: false,
    },
    offlineDelivery: {
      message1Received: false,
      message2Received: false,
      message3Received: false,
    },
    postReconnectMessaging: {
      user1ToUser2: false,
      user2ToUser1: false,
      user1Received: false,
      user2Received: false,
    },
  };

  try {
    // Setup console capture
    setupConsoleCapture(page1, 'Alice', ['P2P', 'error', 'Error', 'ILM']);
    setupConsoleCapture(page2, 'Bob', ['P2P', 'error', 'Error', 'ILM']);

    // ========== STEP 1: Create accounts ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('─'.repeat(50));

    results.accountCreation.user1 = await createAccount(page1, USER1, {
      isFirstUser: true,
      uxTracker,
    });

    results.accountCreation.user2 = await createAccount(page2, USER2, {
      isFirstUser: false,
      uxTracker,
    });

    if (!results.accountCreation.user1 || !results.accountCreation.user2) {
      throw new Error('Account creation failed');
    }

    console.log('\n  Waiting 10s for sessions to be fully established...');
    await sleep(10000);

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('─'.repeat(50));

    results.p2pRegistration = await p2pRegister(page1, USER1, USER2, uxTracker);

    if (!results.p2pRegistration) {
      throw new Error('P2P registration failed');
    }

    // ========== STEP 3: Accept P2P Request ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Accept P2P Request');
    console.log('─'.repeat(50));

    await sleep(3000);
    results.p2pAccept = await acceptP2PRequest(page2, USER2, uxTracker);

    console.log('\n  Waiting for P2P connection to establish...');
    await sleep(5000);

    // ========== STEP 4: Open Conversations ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Open Conversations');
    console.log('─'.repeat(50));

    results.conversationOpen.user1 = await openConversation(page1, USER1, USER2, uxTracker);
    await sleep(3000);
    results.conversationOpen.user2 = await openConversation(page2, USER2, USER1, uxTracker);

    if (!results.conversationOpen.user1 || !results.conversationOpen.user2) {
      throw new Error('Could not open conversations');
    }

    // ========== STEP 5: Initial Bidirectional Messaging ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Initial Bidirectional Messaging');
    console.log('─'.repeat(50));

    const INITIAL_MSG_1 = `Hello Bob! Time: ${new Date().toLocaleTimeString()}`;
    const INITIAL_MSG_2 = `Hi Alice! Got it! Time: ${new Date().toLocaleTimeString()}`;

    // Send warmup messages first
    console.log('  Sending warmup messages...');
    await sendMessage(page1, USER1, 'Warmup from Alice', null);
    await sleep(2000);
    await sendMessage(page2, USER2, 'Warmup from Bob', null);
    await sleep(2000);

    // Test bidirectional messaging
    results.initialMessaging.user1ToUser2 = await sendMessage(page1, USER1, INITIAL_MSG_1, uxTracker);
    await sleep(1000);
    results.initialMessaging.user2ToUser1 = await sendMessage(page2, USER2, INITIAL_MSG_2, uxTracker);
    await sleep(1000);

    results.initialMessaging.user2Received = await verifyMessageReceived(page2, USER2, INITIAL_MSG_1, 15000, uxTracker);
    results.initialMessaging.user1Received = await verifyMessageReceived(page1, USER1, INITIAL_MSG_2, 15000, uxTracker);

    console.log(`  Initial messaging: Alice->Bob=${results.initialMessaging.user2Received}, Bob->Alice=${results.initialMessaging.user1Received}`);

    if (!results.initialMessaging.user1Received || !results.initialMessaging.user2Received) {
      console.log('  WARNING: Initial messaging failed - P2P channel may not be fully established');
    }

    await takeScreenshot(page1, `${USER1}_initial_messaging`);
    await takeScreenshot(page2, `${USER2}_initial_messaging`);

    // ========== STEP 6: Bob TCP Drop (Disconnect) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Bob TCP Drop (Disconnect)');
    console.log('─'.repeat(50));

    results.disconnection.user2Disconnected = await disconnectViaTcpDrop(page2, USER2, uxTracker);
    console.log(`  Bob disconnected: ${results.disconnection.user2Disconnected}`);

    // Wait for disconnect to propagate
    console.log('  Waiting 10s for ILM to detect peer offline...');
    await sleep(10000);

    // ========== STEP 7: Assert Bob IS in OrphanSessionsNavbar ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Assert Session Orphaned');
    console.log('─'.repeat(50));

    // Use a temp page in Alice's browser to check OrphanNavbar
    const aliceContext = browsers[0].contexts()[0];
    const tempCheckPage = await aliceContext.newPage();
    const config = await import('../lib/config.js');
    await tempCheckPage.goto(config.config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await sleep(3000);

    results.disconnection.sessionOrphaned = await assertSessionInOrphanNavbar(tempCheckPage, USER2, uxTracker);
    console.log(`  Session orphaned: ${results.disconnection.sessionOrphaned}`);

    await tempCheckPage.close();
    await sleep(1000);

    // ========== STEP 8: Alice Sends Offline Messages ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 8: Alice Sends Offline Messages');
    console.log('─'.repeat(50));

    const OFFLINE_MSG_1 = 'Bob, this is offline message 1';
    const OFFLINE_MSG_2 = 'Bob, this is offline message 2';
    const OFFLINE_MSG_3 = 'Bob, this is offline message 3 - did you get all of them?';

    // Ensure Alice's conversation is still open
    await openConversation(page1, USER1, USER2, uxTracker);

    results.offlineMessages.message1Sent = await sendMessage(page1, USER1, OFFLINE_MSG_1);
    console.log(`  Offline message 1: ${results.offlineMessages.message1Sent ? 'SENT' : 'FAILED'}`);
    await sleep(1000);

    results.offlineMessages.message2Sent = await sendMessage(page1, USER1, OFFLINE_MSG_2);
    console.log(`  Offline message 2: ${results.offlineMessages.message2Sent ? 'SENT' : 'FAILED'}`);
    await sleep(1000);

    results.offlineMessages.message3Sent = await sendMessage(page1, USER1, OFFLINE_MSG_3);
    console.log(`  Offline message 3: ${results.offlineMessages.message3Sent ? 'SENT' : 'FAILED'}`);

    await takeScreenshot(page1, `${USER1}_offline_messages_sent`);

    // ========== STEP 9: Bob Reconnects via ClaimSession ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 9: Bob Reconnects via ClaimSession');
    console.log('─'.repeat(50));

    // Create new page for Bob in Bob's browser
    const bobContext = browsers[1].contexts()[0];
    const reconnectPage = await bobContext.newPage();
    setupConsoleCapture(reconnectPage, 'Bob-Reconnect', ['P2P', 'error', 'Error', 'ILM']);

    results.reconnection.claimSessionSuccess = await reconnectViaClaimSession(reconnectPage, USER2, uxTracker);
    results.reconnection.user2Reconnected = results.reconnection.claimSessionSuccess;
    console.log(`  ClaimSession: ${results.reconnection.claimSessionSuccess ? 'SUCCESS' : 'FAILED'}`);

    if (!results.reconnection.claimSessionSuccess) {
      console.log('  WARNING: ClaimSession failed - offline messages may not be delivered');
      await takeScreenshot(reconnectPage, `${USER2}_claimsession_failed`);
    }

    // Wait for P2P reconnection and ILM delivery
    console.log('  Waiting 15s for P2P reconnection and ILM delivery...');
    await sleep(15000);

    // ========== STEP 10: Verify Offline Messages Received ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 10: Verify Offline Messages Received');
    console.log('─'.repeat(50));

    await openConversation(reconnectPage, USER2, USER1, uxTracker);
    await sleep(3000);

    results.offlineDelivery.message1Received = await verifyMessageReceived(reconnectPage, USER2, OFFLINE_MSG_1, 15000);
    console.log(`  Offline message 1: ${results.offlineDelivery.message1Received ? 'RECEIVED' : 'NOT RECEIVED'}`);

    results.offlineDelivery.message2Received = await verifyMessageReceived(reconnectPage, USER2, OFFLINE_MSG_2, 5000);
    console.log(`  Offline message 2: ${results.offlineDelivery.message2Received ? 'RECEIVED' : 'NOT RECEIVED'}`);

    results.offlineDelivery.message3Received = await verifyMessageReceived(reconnectPage, USER2, OFFLINE_MSG_3, 5000);
    console.log(`  Offline message 3: ${results.offlineDelivery.message3Received ? 'RECEIVED' : 'NOT RECEIVED'}`);

    await takeScreenshot(reconnectPage, `${USER2}_offline_messages_verification`);

    // ========== STEP 11: Post-Reconnect Bidirectional Messaging ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 11: Post-Reconnect Bidirectional Messaging');
    console.log('─'.repeat(50));

    const POST_MSG_1 = 'Welcome back Bob! Did you get my offline messages?';
    const POST_MSG_2 = 'Thanks Alice! Yes I got all of them!';

    results.postReconnectMessaging.user1ToUser2 = await sendMessage(page1, USER1, POST_MSG_1);
    await sleep(1000);
    results.postReconnectMessaging.user2ToUser1 = await sendMessage(reconnectPage, USER2, POST_MSG_2);
    await sleep(1000);

    results.postReconnectMessaging.user2Received = await verifyMessageReceived(reconnectPage, USER2, POST_MSG_1, 10000);
    results.postReconnectMessaging.user1Received = await verifyMessageReceived(page1, USER1, POST_MSG_2, 10000);

    console.log(`  Post-reconnect: Alice->Bob=${results.postReconnectMessaging.user2Received}, Bob->Alice=${results.postReconnectMessaging.user1Received}`);

    await takeScreenshot(page1, `${USER1}_final`);
    await takeScreenshot(reconnectPage, `${USER2}_final`);

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const offlineDeliverySuccess =
      results.offlineDelivery.message1Received &&
      results.offlineDelivery.message2Received &&
      results.offlineDelivery.message3Received;

    const allPassed =
      results.accountCreation.user1 &&
      results.accountCreation.user2 &&
      results.p2pRegistration &&
      results.conversationOpen.user1 &&
      results.conversationOpen.user2 &&
      results.initialMessaging.user1Received &&
      results.initialMessaging.user2Received &&
      results.disconnection.user2Disconnected &&
      results.disconnection.sessionOrphaned &&
      results.reconnection.claimSessionSuccess &&
      offlineDeliverySuccess &&
      results.postReconnectMessaging.user1Received &&
      results.postReconnectMessaging.user2Received;

    console.log('\nPhase 1 - Account & Registration:');
    console.log(`  Account Creation:       ${results.accountCreation.user1 && results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Registration:       ${results.p2pRegistration ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Accept:             ${results.p2pAccept ? 'PASS' : 'FAIL'}`);

    console.log('\nPhase 2 - Initial Messaging:');
    console.log(`  Open Conversations:     ${results.conversationOpen.user1 && results.conversationOpen.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  Alice -> Bob:           ${results.initialMessaging.user2Received ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob -> Alice:           ${results.initialMessaging.user1Received ? 'PASS' : 'FAIL'}`);

    console.log('\nPhase 3 - Disconnect & Offline:');
    console.log(`  Bob TCP Drop:           ${results.disconnection.user2Disconnected ? 'PASS' : 'FAIL'}`);
    console.log(`  Session Orphaned:       ${results.disconnection.sessionOrphaned ? 'PASS' : 'FAIL'}`);
    console.log(`  Offline Msgs Sent:      ${results.offlineMessages.message1Sent && results.offlineMessages.message2Sent && results.offlineMessages.message3Sent ? 'PASS' : 'FAIL'}`);

    console.log('\nPhase 4 - Reconnect & ILM Delivery:');
    console.log(`  ClaimSession:           ${results.reconnection.claimSessionSuccess ? 'PASS' : 'FAIL'}`);
    console.log(`  Offline Msg 1 Received: ${results.offlineDelivery.message1Received ? 'PASS' : 'FAIL'}`);
    console.log(`  Offline Msg 2 Received: ${results.offlineDelivery.message2Received ? 'PASS' : 'FAIL'}`);
    console.log(`  Offline Msg 3 Received: ${results.offlineDelivery.message3Received ? 'PASS' : 'FAIL'}`);

    console.log('\nPhase 5 - Post-Reconnect Messaging:');
    console.log(`  Alice -> Bob:           ${results.postReconnectMessaging.user2Received ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob -> Alice:           ${results.postReconnectMessaging.user1Received ? 'PASS' : 'FAIL'}`);

    const uxIssues = uxTracker.getIssues();
    if (uxIssues.length > 0) {
      console.log('\n' + '─'.repeat(50));
      console.log('UX ISSUES FOUND:');
      console.log('─'.repeat(50));
      uxIssues.forEach((issue, i) => {
        console.log(`\n${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}`);
        console.log(`   ${issue.description}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL: ${allPassed ? 'TEST PASSED' : 'TEST FAILED'}`);
    console.log('='.repeat(60));

    logObservation('test-complete', `Offline Messaging Test ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    writeTestReport('OFFLINE_MESSAGING_TEST_REPORT.json', {
      users: { user1: USER1, user2: USER2 },
      results,
      uxIssues,
      passed: allPassed,
    });

    console.log('\nBrowser will remain open for 20 seconds for manual inspection...');
    await sleep(20000);

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', 'Offline Messaging Test Error', {
      error: String(error),
    }, 'failed');
    throw error;
  } finally {
    await cleanup();
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
