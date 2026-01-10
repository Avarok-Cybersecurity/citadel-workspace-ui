/**
 * Hard Disconnect Offline Messaging Test
 *
 * Tests offline messaging with EXPLICIT disconnect (Sign out) and re-login.
 * Unlike the standard offline test which uses TCP drop + ClaimSession,
 * this test uses the "Sign out" button and requires credential re-login.
 *
 * Test Flow:
 * 1. Create two users in separate browser processes
 * 2. P2P register User1 -> User2
 * 3. User2 accepts the P2P request
 * 4. Test bidirectional messaging (verify P2P works)
 * 5. User2 disconnects via TopBar "Sign out" (explicit disconnect)
 * 6. Assert User2 is NOT in OrphanSessionsNavbar (session removed, not orphaned)
 * 7. User1 sends messages while User2 is offline (ILM queues them)
 * 8. User2 logs back in with credentials (new session created)
 * 9. Wait for P2PAutoConnect to re-establish P2P connection
 * 10. Verify User2 received offline messages
 * 11. Exchange post-reconnect messages
 *
 * Key Differences from ClaimSession Test:
 * - Explicit disconnect destroys the session (not orphaned)
 * - Login preserves the SAME CID (only Register creates new CID)
 * - P2P registration persists (stored on server)
 * - P2PAutoConnect automatically reconnects to registered peers
 * - ILM delivers queued messages using the preserved CID
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
  waitForAllMessages,
  disconnectViaTopBar,
  assertSessionNotInOrphanNavbar,
  loginAfterDisconnect,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  setupConsoleCapture,
  logObservation,
  UxIssueTracker,
  config,
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
    sessionNotOrphaned: boolean;
  };
  offlineMessages: {
    message1Sent: boolean;
    message2Sent: boolean;
    message3Sent: boolean;
  };
  reconnection: {
    user2LoggedIn: boolean;
    p2pReEstablished: boolean;
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
const USER1 = `harddc_alice_${timestamp}`;
const USER2 = `harddc_bob_${timestamp}`;

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('HARD DISCONNECT OFFLINE MESSAGING TEST');
  console.log('='.repeat(60));
  console.log(`User 1 (Alice): ${USER1}`);
  console.log(`User 2 (Bob): ${USER2}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Wait for services
  await waitForServicesAlive();

  logObservation('test-start', 'Hard Disconnect Offline Messaging Test Started', {
    user1: USER1,
    user2: USER2,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Use SEPARATE browser processes to eliminate Chrome tab throttling
  const { pages: [page1, page2], cleanup } = await createSeparateBrowsers(2, {
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
      sessionNotOrphaned: false,
    },
    offlineMessages: {
      message1Sent: false,
      message2Sent: false,
      message3Sent: false,
    },
    reconnection: {
      user2LoggedIn: false,
      p2pReEstablished: false,
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
    // Setup console capture - include Connect logs for debugging login flow
    setupConsoleCapture(page1, 'Alice', ['P2P', 'error', 'Error', 'ILM', 'Connect', 'WS-MSG', 'websocket']);
    setupConsoleCapture(page2, 'Bob', ['P2P', 'error', 'Error', 'ILM', 'Connect', 'WS-MSG', 'websocket']);

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

    // ========== STEP 6: Bob Hard Disconnect (Sign out) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Bob Hard Disconnect (Sign out via TopBar)');
    console.log('─'.repeat(50));

    results.disconnection.user2Disconnected = await disconnectViaTopBar(page2, USER2, uxTracker);
    console.log(`  Bob disconnected: ${results.disconnection.user2Disconnected}`);

    if (!results.disconnection.user2Disconnected) {
      throw new Error('Hard disconnect failed');
    }

    // Wait for disconnect to propagate
    console.log('  Waiting 10s for disconnect to propagate...');
    await sleep(10000);

    // ========== STEP 7: Assert Bob is NOT in OrphanSessionsNavbar ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Assert Session NOT Orphaned (explicitly disconnected)');
    console.log('─'.repeat(50));

    // Use Bob's browser to check the landing page
    results.disconnection.sessionNotOrphaned = await assertSessionNotInOrphanNavbar(page2, USER2, uxTracker);
    console.log(`  Session not orphaned: ${results.disconnection.sessionNotOrphaned}`);

    // ========== STEP 8: Alice Sends Offline Messages ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 8: Alice Sends Offline Messages');
    console.log('─'.repeat(50));

    const OFFLINE_MSG_1 = 'Bob, this is offline message 1 (hard disconnect test)';
    const OFFLINE_MSG_2 = 'Bob, this is offline message 2 (hard disconnect test)';
    const OFFLINE_MSG_3 = 'Bob, this is offline message 3 - did you get all of them?';

    // Ensure Alice's conversation is still open
    await openConversation(page1, USER1, USER2, uxTracker);

    results.offlineMessages.message1Sent = await sendMessage(page1, USER1, OFFLINE_MSG_1);
    console.log(`  Offline message 1: ${results.offlineMessages.message1Sent ? 'SENT' : 'FAILED'}`);
    // Wait longer between offline messages to avoid UI input debouncing issues
    await sleep(2500);

    results.offlineMessages.message2Sent = await sendMessage(page1, USER1, OFFLINE_MSG_2);
    console.log(`  Offline message 2: ${results.offlineMessages.message2Sent ? 'SENT' : 'FAILED'}`);
    await sleep(2500);

    results.offlineMessages.message3Sent = await sendMessage(page1, USER1, OFFLINE_MSG_3);
    console.log(`  Offline message 3: ${results.offlineMessages.message3Sent ? 'SENT' : 'FAILED'}`);

    await takeScreenshot(page1, `${USER1}_offline_messages_sent`);

    // ========== STEP 9: Bob Logs Back In ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 9: Bob Logs Back In With Credentials');
    console.log('─'.repeat(50));

    results.reconnection.user2LoggedIn = await loginAfterDisconnect(
      page2,
      USER2,
      config.DEFAULT_PASSWORD,
      uxTracker
    );
    console.log(`  Login: ${results.reconnection.user2LoggedIn ? 'SUCCESS' : 'FAILED'}`);

    if (!results.reconnection.user2LoggedIn) {
      console.log('  WARNING: Login failed - offline messages may not be delivered');
      await takeScreenshot(page2, `${USER2}_login_failed`);
    }

    // Wait for P2PAutoConnect to re-establish connections
    console.log('  Waiting 15s for P2PAutoConnect to re-establish P2P connection...');
    await sleep(15000);

    // ========== STEP 10: Verify Offline Messages Received ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 10: Verify Offline Messages Received');
    console.log('─'.repeat(50));

    // Check if P2P was re-established by trying to open conversation
    results.reconnection.p2pReEstablished = await openConversation(page2, USER2, USER1, uxTracker);
    console.log(`  P2P re-established: ${results.reconnection.p2pReEstablished}`);

    if (!results.reconnection.p2pReEstablished) {
      console.log('  WARNING: P2P not re-established - trying to wait longer...');
      await sleep(10000);
      results.reconnection.p2pReEstablished = await openConversation(page2, USER2, USER1, uxTracker);
    }

    // Give conversation time to fully load messages from local storage/ILM
    console.log('  Waiting 5s for conversation to fully load...');
    await sleep(5000);

    // Use reactive polling to wait for all offline messages at once
    // This is more efficient than sequential checks with fixed timeouts
    // ILM has significant control traffic (GetSessions, Poll, ACK) interspersed with data messages,
    // so offline messages may take a while to be delivered after reconnection
    const offlineMessageResults = await waitForAllMessages(
      page2,
      USER2,
      [OFFLINE_MSG_1, OFFLINE_MSG_2, OFFLINE_MSG_3],
      180000, // 180s (3 min) timeout - ILM delivery can be slow due to control traffic
      500    // Poll every 500ms
    );

    results.offlineDelivery.message1Received = offlineMessageResults.results[OFFLINE_MSG_1];
    results.offlineDelivery.message2Received = offlineMessageResults.results[OFFLINE_MSG_2];
    results.offlineDelivery.message3Received = offlineMessageResults.results[OFFLINE_MSG_3];

    console.log(`  Offline message 1: ${results.offlineDelivery.message1Received ? 'RECEIVED' : 'NOT RECEIVED'}`);
    console.log(`  Offline message 2: ${results.offlineDelivery.message2Received ? 'RECEIVED' : 'NOT RECEIVED'}`);
    console.log(`  Offline message 3: ${results.offlineDelivery.message3Received ? 'RECEIVED' : 'NOT RECEIVED'}`);

    await takeScreenshot(page2, `${USER2}_offline_messages_verification`);

    // ========== STEP 11: Post-Reconnect Bidirectional Messaging ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 11: Post-Reconnect Bidirectional Messaging');
    console.log('─'.repeat(50));

    const POST_MSG_1 = 'Welcome back Bob! Did you get my offline messages?';
    const POST_MSG_2 = 'Thanks Alice! Yes I got all of them (hard disconnect test)!';

    results.postReconnectMessaging.user1ToUser2 = await sendMessage(page1, USER1, POST_MSG_1);
    await sleep(1000);
    results.postReconnectMessaging.user2ToUser1 = await sendMessage(page2, USER2, POST_MSG_2);
    await sleep(1000);

    results.postReconnectMessaging.user2Received = await verifyMessageReceived(page2, USER2, POST_MSG_1, 10000);
    results.postReconnectMessaging.user1Received = await verifyMessageReceived(page1, USER1, POST_MSG_2, 10000);

    console.log(`  Post-reconnect: Alice->Bob=${results.postReconnectMessaging.user2Received}, Bob->Alice=${results.postReconnectMessaging.user1Received}`);

    await takeScreenshot(page1, `${USER1}_final`);
    await takeScreenshot(page2, `${USER2}_final`);

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
      results.disconnection.sessionNotOrphaned &&
      results.reconnection.user2LoggedIn &&
      results.reconnection.p2pReEstablished &&
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

    console.log('\nPhase 3 - Hard Disconnect:');
    console.log(`  Bob Sign Out:           ${results.disconnection.user2Disconnected ? 'PASS' : 'FAIL'}`);
    console.log(`  Session NOT Orphaned:   ${results.disconnection.sessionNotOrphaned ? 'PASS' : 'FAIL'}`);
    console.log(`  Offline Msgs Sent:      ${results.offlineMessages.message1Sent && results.offlineMessages.message2Sent && results.offlineMessages.message3Sent ? 'PASS' : 'FAIL'}`);

    console.log('\nPhase 4 - Re-Login & Delivery:');
    console.log(`  Bob Login:              ${results.reconnection.user2LoggedIn ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Re-established:     ${results.reconnection.p2pReEstablished ? 'PASS' : 'FAIL'}`);
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

    logObservation('test-complete', `Hard Disconnect Offline Messaging Test ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    writeTestReport('HARD_DISCONNECT_OFFLINE_TEST_REPORT.json', {
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
    logObservation('test-error', 'Hard Disconnect Offline Messaging Test Error', {
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
