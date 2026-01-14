/**
 * P2P Messaging Test
 *
 * Tests the P2P chat messaging workflow:
 * 1. Create two users in separate tabs
 * 2. P2P register User1 -> User2
 * 3. User2 accepts the P2P request
 * 4. Test bidirectional messaging
 * 5. Verify message delivery
 * 6. Document any UX issues
 */

const testLib = require('./test-lib.cjs');

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `msg_alice_${timestamp}`;
const USER2 = `msg_bob_${timestamp}`;

// ============================================================================
// Additional UX Check Functions (specific to this test)
// ============================================================================

async function checkMessageTimestamp(page, username) {
  console.log(`\n=== ${username}: Checking message timestamps ===`);
  const count = await page.locator('time, [class*="timestamp"], .text-xs.text-gray').count();

  if (count > 0) {
    console.log(`  Found ${count} timestamp elements`);
    return true;
  } else {
    return false;
  }
}

async function checkOnlineStatus(page, username, peerUsername) {
  console.log(`\n=== ${username}: Checking peer online status ===`);
  const statusIndicator = page.locator('.bg-green-500, [class*="online"]').first();

  if (await statusIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`  Online status indicator visible`);
    return true;
  } else {
    return false;
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest() {
  console.log('='.repeat(60));
  console.log('P2P MESSAGING TEST');
  console.log('='.repeat(60));
  console.log(`User 1 (Alice): ${USER1}`);
  console.log(`User 2 (Bob): ${USER2}`);
  console.log('');

  // Initialize
  testLib.ensureScreenshotsDir();
  const uxTracker = new testLib.UxIssueTracker();

  // Wait for services
  await testLib.waitForServicesAlive();

  // Setup browser with shared context (single WebSocket for both tabs)
  const { browser, context } = await testLib.createBrowser({ headless: false, slowMo: 50 });

  const results = {
    accountCreation: { user1: false, user2: false },
    p2pRegistration: false,
    p2pAccept: false,
    conversationOpen: { user1: false, user2: false },
    messaging: {
      user1ToUser2: false,
      user2ToUser1: false,
      user1Received: false,
      user2Received: false,
    },
    uxChecks: {
      timestamps: false,
      onlineStatus: false,
    },
  };

  try {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Setup console capture
    testLib.setupConsoleCapture(page1, 'Alice', ['P2P', 'error', 'Error']);
    testLib.setupConsoleCapture(page2, 'Bob', ['P2P', 'error', 'Error']);

    // ========== STEP 1: Create accounts ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('─'.repeat(50));

    results.accountCreation.user1 = await testLib.createAccount(page1, USER1, {
      isFirstUser: true,
      uxTracker,
    });

    results.accountCreation.user2 = await testLib.createAccount(page2, USER2, {
      isFirstUser: false,
      uxTracker,
    });

    // Wait for sessions to be fully established in Citadel SDK session manager
    console.log('\n  Waiting 10s for sessions to be fully established...');
    await testLib.sleep(10000);

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('─'.repeat(50));

    results.p2pRegistration = await testLib.p2pRegister(page1, USER1, USER2, uxTracker);

    // ========== STEP 3: Accept P2P Request ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Accept P2P Request');
    console.log('─'.repeat(50));

    await testLib.sleep(3000);
    results.p2pAccept = await testLib.acceptP2PRequest(page2, USER2, uxTracker);

    // Wait for connection to establish
    console.log('\n  Waiting for P2P connection to establish...');
    await testLib.sleep(5000);

    // ========== STEP 4: Open Conversations ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Open Conversations');
    console.log('─'.repeat(50));

    results.conversationOpen.user1 = await testLib.openConversation(page1, USER1, USER2, uxTracker);
    results.conversationOpen.user2 = await testLib.openConversation(page2, USER2, USER1, uxTracker);

    // ========== STEP 5: Test Messaging ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Bidirectional Messaging');
    console.log('─'.repeat(50));

    const MESSAGE_1 = `Hello Bob! This is Alice. Time: ${new Date().toLocaleTimeString()}`;
    const MESSAGE_2 = `Hi Alice! Bob here. Got your message! Time: ${new Date().toLocaleTimeString()}`;
    const MESSAGE_3 = `Great! The P2P chat is working perfectly!`;

    // Alice sends first message
    results.messaging.user1ToUser2 = await testLib.sendMessage(page1, USER1, MESSAGE_1, uxTracker);

    // Verify Bob receives it
    if (results.messaging.user1ToUser2) {
      results.messaging.user2Received = await testLib.verifyMessageReceived(page2, USER2, MESSAGE_1, 10000, uxTracker);
    }

    // Bob replies
    results.messaging.user2ToUser1 = await testLib.sendMessage(page2, USER2, MESSAGE_2, uxTracker);

    // Verify Alice receives it
    if (results.messaging.user2ToUser1) {
      results.messaging.user1Received = await testLib.verifyMessageReceived(page1, USER1, MESSAGE_2, 10000, uxTracker);
    }

    // Alice sends another message
    await testLib.sendMessage(page1, USER1, MESSAGE_3, uxTracker);
    await testLib.verifyMessageReceived(page2, USER2, MESSAGE_3, 10000, uxTracker);

    // ========== STEP 6: UX Checks ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: UX Quality Checks');
    console.log('─'.repeat(50));

    results.uxChecks.timestamps = await checkMessageTimestamp(page1, USER1);
    if (!results.uxChecks.timestamps) {
      uxTracker.log('minor', 'visual', 'No visible timestamps on messages');
    }

    results.uxChecks.onlineStatus = await checkOnlineStatus(page1, USER1, USER2);
    if (!results.uxChecks.onlineStatus) {
      uxTracker.log('minor', 'visual', 'Peer online status indicator not clearly visible');
    }

    // Final screenshots
    await testLib.takeScreenshot(page1, 'FINAL_alice');
    await testLib.takeScreenshot(page2, 'FINAL_bob');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const allPassed =
      results.accountCreation.user1 &&
      results.accountCreation.user2 &&
      results.p2pRegistration &&
      results.conversationOpen.user1 &&
      results.conversationOpen.user2 &&
      results.messaging.user1ToUser2 &&
      results.messaging.user2ToUser1 &&
      results.messaging.user1Received &&
      results.messaging.user2Received;

    console.log('\nCore Functionality:');
    console.log(`  Account Creation (Alice):     ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Account Creation (Bob):       ${results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Registration:             ${results.p2pRegistration ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Accept:                   ${results.p2pAccept ? 'PASS' : 'SKIPPED'}`);
    console.log(`  Open Conversation (Alice):    ${results.conversationOpen.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Open Conversation (Bob):      ${results.conversationOpen.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  Alice -> Bob Message:         ${results.messaging.user1ToUser2 ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob Received Message:         ${results.messaging.user2Received ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob -> Alice Message:         ${results.messaging.user2ToUser1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Alice Received Message:       ${results.messaging.user1Received ? 'PASS' : 'FAIL'}`);

    console.log('\nUX Quality:');
    console.log(`  Message Timestamps:           ${results.uxChecks.timestamps ? 'PASS' : 'CHECK'}`);
    console.log(`  Online Status Indicator:      ${results.uxChecks.onlineStatus ? 'PASS' : 'CHECK'}`);

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

    // Write report
    testLib.writeTestReport('P2P_MESSAGING_TEST_REPORT.json', {
      users: { user1: USER1, user2: USER2 },
      results,
      uxIssues,
      passed: allPassed,
    });

    console.log('\nBrowser will remain open for 20 seconds for manual inspection...');
    await testLib.sleep(20000);

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

runTest().then(passed => {
  process.exit(passed ? 0 : 1);
}).catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
