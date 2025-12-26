/**
 * Multi-User Group Messaging Integration Test
 *
 * Tests group chat messaging with multiple users:
 * 1. Create two users in separate tabs
 * 2. Both navigate to the same office
 * 3. Both switch to Chat tab
 * 4. User1 sends a message, User2 receives it
 * 5. User2 sends a reply, User1 receives it
 * 6. Both navigate to the same room
 * 7. Test bidirectional messaging in room
 * 8. Document any UX issues
 */

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
  navigateToOffice,
  navigateToRoom,
  switchToChatTab,
  isChatEnabled,
  sendGroupMessage,
  verifyGroupMessageReceived,
  waitForWorkspaceLoaded,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: {
    user1: boolean;
    user2: boolean;
  };

  // Office Chat Tests
  officeNavigation: {
    user1: boolean;
    user2: boolean;
  };
  officeChatEnabled: boolean;
  officeChatTab: {
    user1: boolean;
    user2: boolean;
  };
  officeMessaging: {
    user1Sent: boolean;
    user2Received: boolean;
    user2Sent: boolean;
    user1Received: boolean;
  };

  // Room Chat Tests
  roomNavigation: {
    user1: boolean;
    user2: boolean;
  };
  roomChatEnabled: boolean;
  roomChatTab: {
    user1: boolean;
    user2: boolean;
  };
  roomMessaging: {
    user1Sent: boolean;
    user2Received: boolean;
    user2Sent: boolean;
    user1Received: boolean;
  };
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `grp_alice_${timestamp}`;
const USER2 = `grp_bob_${timestamp}`;

// Default offices/rooms from workspaces.json config
const TEST_OFFICE = 'General';
const TEST_ROOM = 'Random';

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('MULTI-USER GROUP MESSAGING TEST');
  console.log('='.repeat(60));
  console.log(`User 1: ${USER1}`);
  console.log(`User 2: ${USER2}`);
  console.log(`Test Office: ${TEST_OFFICE}`);
  console.log(`Test Room: ${TEST_ROOM}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Wait for services
  await waitForServicesAlive();

  // Log the test start
  logObservation('test-start', 'Multi-User Group Messaging Test Started', {
    user1: USER1,
    user2: USER2,
    office: TEST_OFFICE,
    room: TEST_ROOM,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser with shared context (single WebSocket for both tabs)
  const { browser, context } = await createBrowser({ headless: false, slowMo: 50 });

  const results: TestResults = {
    accountCreation: { user1: false, user2: false },
    officeNavigation: { user1: false, user2: false },
    officeChatEnabled: false,
    officeChatTab: { user1: false, user2: false },
    officeMessaging: {
      user1Sent: false,
      user2Received: false,
      user2Sent: false,
      user1Received: false,
    },
    roomNavigation: { user1: false, user2: false },
    roomChatEnabled: false,
    roomChatTab: { user1: false, user2: false },
    roomMessaging: {
      user1Sent: false,
      user2Received: false,
      user2Sent: false,
      user1Received: false,
    },
  };

  try {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Setup console capture
    setupConsoleCapture(page1, 'Alice', ['group', 'chat', 'message', 'error']);
    setupConsoleCapture(page2, 'Bob', ['group', 'chat', 'message', 'error']);

    // ========== STEP 1: Create Accounts ==========
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

    // Wait for workspaces to load
    console.log('\n  Waiting for workspaces to load...');
    await waitForWorkspaceLoaded(page1, 30000);
    await waitForWorkspaceLoaded(page2, 30000);
    await sleep(3000);

    // ========== STEP 2: Both Navigate to Office ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Navigate to Office');
    console.log('─'.repeat(50));

    results.officeNavigation.user1 = await navigateToOffice(page1, USER1, TEST_OFFICE, { uxTracker });
    results.officeNavigation.user2 = await navigateToOffice(page2, USER2, TEST_OFFICE, { uxTracker });
    await sleep(2000);

    // ========== STEP 3: Office Chat Test ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Office Group Chat Test');
    console.log('─'.repeat(50));

    results.officeChatEnabled = await isChatEnabled(page1, USER1);

    if (results.officeChatEnabled) {
      // Both switch to Chat tab
      results.officeChatTab.user1 = await switchToChatTab(page1, USER1, { uxTracker });
      results.officeChatTab.user2 = await switchToChatTab(page2, USER2, { uxTracker });
      await sleep(2000);

      if (results.officeChatTab.user1 && results.officeChatTab.user2) {
        // User1 sends a message
        const msg1 = `Hello from ${USER1}! Office chat test. Time: ${new Date().toISOString()}`;
        results.officeMessaging.user1Sent = await sendGroupMessage(page1, USER1, msg1, { uxTracker });
        await sleep(3000);

        // User2 should receive it
        if (results.officeMessaging.user1Sent) {
          results.officeMessaging.user2Received = await verifyGroupMessageReceived(page2, USER2, msg1, 15000, { uxTracker });
        }

        // User2 sends a reply
        const msg2 = `Reply from ${USER2}! Got your message. Time: ${new Date().toISOString()}`;
        results.officeMessaging.user2Sent = await sendGroupMessage(page2, USER2, msg2, { uxTracker });
        await sleep(3000);

        // User1 should receive it
        if (results.officeMessaging.user2Sent) {
          results.officeMessaging.user1Received = await verifyGroupMessageReceived(page1, USER1, msg2, 15000, { uxTracker });
        }
      }
    } else {
      console.log(`  Office "${TEST_OFFICE}" does not have chat enabled, skipping office chat test`);
    }

    // ========== STEP 4: Both Navigate to Room ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Navigate to Room');
    console.log('─'.repeat(50));

    results.roomNavigation.user1 = await navigateToRoom(page1, USER1, TEST_ROOM, { uxTracker });
    results.roomNavigation.user2 = await navigateToRoom(page2, USER2, TEST_ROOM, { uxTracker });
    await sleep(2000);

    // ========== STEP 5: Room Chat Test ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Room Group Chat Test');
    console.log('─'.repeat(50));

    results.roomChatEnabled = await isChatEnabled(page1, USER1);

    if (results.roomChatEnabled) {
      // Both switch to Chat tab
      results.roomChatTab.user1 = await switchToChatTab(page1, USER1, { uxTracker });
      results.roomChatTab.user2 = await switchToChatTab(page2, USER2, { uxTracker });
      await sleep(2000);

      if (results.roomChatTab.user1 && results.roomChatTab.user2) {
        // User1 sends a message
        const roomMsg1 = `Room message from ${USER1}! Testing ${TEST_ROOM}. Time: ${new Date().toISOString()}`;
        results.roomMessaging.user1Sent = await sendGroupMessage(page1, USER1, roomMsg1, { uxTracker });
        await sleep(3000);

        // User2 should receive it
        if (results.roomMessaging.user1Sent) {
          results.roomMessaging.user2Received = await verifyGroupMessageReceived(page2, USER2, roomMsg1, 15000, { uxTracker });
        }

        // User2 sends a reply
        const roomMsg2 = `Room reply from ${USER2}! I see your message! Time: ${new Date().toISOString()}`;
        results.roomMessaging.user2Sent = await sendGroupMessage(page2, USER2, roomMsg2, { uxTracker });
        await sleep(3000);

        // User1 should receive it
        if (results.roomMessaging.user2Sent) {
          results.roomMessaging.user1Received = await verifyGroupMessageReceived(page1, USER1, roomMsg2, 15000, { uxTracker });
        }
      }
    } else {
      console.log(`  Room "${TEST_ROOM}" does not have chat enabled, skipping room chat test`);
    }

    // Final screenshots
    await takeScreenshot(page1, 'FINAL_alice_group');
    await takeScreenshot(page2, 'FINAL_bob_group');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const accountsCreated = results.accountCreation.user1 && results.accountCreation.user2;

    const officeTestPassed = !results.officeChatEnabled || (
      results.officeChatTab.user1 &&
      results.officeChatTab.user2 &&
      results.officeMessaging.user1Sent &&
      results.officeMessaging.user2Received &&
      results.officeMessaging.user2Sent &&
      results.officeMessaging.user1Received
    );

    const roomTestPassed = !results.roomChatEnabled || (
      results.roomChatTab.user1 &&
      results.roomChatTab.user2 &&
      results.roomMessaging.user1Sent &&
      results.roomMessaging.user2Received &&
      results.roomMessaging.user2Sent &&
      results.roomMessaging.user1Received
    );

    const allPassed = accountsCreated && officeTestPassed && roomTestPassed;

    console.log('\nAccount Creation:');
    console.log(`  User 1 (${USER1}):           ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  User 2 (${USER2}):           ${results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);

    console.log('\nOffice Chat (${TEST_OFFICE}):');
    console.log(`  Chat Enabled:               ${results.officeChatEnabled ? 'YES' : 'NO'}`);
    console.log(`  User1 Navigate:             ${results.officeNavigation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  User2 Navigate:             ${results.officeNavigation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  User1 Chat Tab:             ${results.officeChatTab.user1 ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User2 Chat Tab:             ${results.officeChatTab.user2 ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User1 -> User2 Msg:         ${results.officeMessaging.user1Sent ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User2 Received:             ${results.officeMessaging.user2Received ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User2 -> User1 Msg:         ${results.officeMessaging.user2Sent ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User1 Received:             ${results.officeMessaging.user1Received ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);

    console.log('\nRoom Chat (${TEST_ROOM}):');
    console.log(`  Chat Enabled:               ${results.roomChatEnabled ? 'YES' : 'NO'}`);
    console.log(`  User1 Navigate:             ${results.roomNavigation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  User2 Navigate:             ${results.roomNavigation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  User1 Chat Tab:             ${results.roomChatTab.user1 ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User2 Chat Tab:             ${results.roomChatTab.user2 ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User1 -> User2 Msg:         ${results.roomMessaging.user1Sent ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User2 Received:             ${results.roomMessaging.user2Received ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User2 -> User1 Msg:         ${results.roomMessaging.user2Sent ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  User1 Received:             ${results.roomMessaging.user1Received ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);

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
    logObservation('test-complete', `Multi-User Group Messaging Test ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    // Write report
    writeTestReport('GROUP_MESSAGING_MULTIUSER_TEST_REPORT.json', {
      users: { user1: USER1, user2: USER2 },
      office: TEST_OFFICE,
      room: TEST_ROOM,
      results,
      uxIssues,
      passed: allPassed,
    });

    console.log('\nBrowser will remain open for 15 seconds for manual inspection...');
    await sleep(15000);

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', 'Multi-User Group Messaging Test Error', {
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
