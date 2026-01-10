/**
 * Room Group Chat Integration Test
 *
 * Tests group chat messaging in a room with parameterized user counts (2, 3).
 * Each test creates N users and verifies bidirectional messaging between all pairs.
 */

import {
  sleep,
  createBrowser,
  ensureScreenshotsDir,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  logObservation,
  UxIssueTracker,
  isChatEnabled,
  restartBackendServices,
  startDiagnostics,
  createNUsers,
  navigateAllToOffice,
  navigateAllToRoom,
  switchAllToChatTab,
  testBidirectionalMessaging,
  printGroupTestResults,
  calculateAllPassed,
  type GroupTestResults,
  type DiagnosticsHandle,
} from '../../lib/index.js';

// ============================================================================
// Configuration
// ============================================================================

// User counts to test - run tests for 2 and 3 users
const USER_COUNTS = [2, 3];

// Default office and room from workspaces.json config
const TEST_OFFICE = 'General';
const TEST_ROOM = 'Random';

// ============================================================================
// Test Runner
// ============================================================================

async function runRoomTest(userCount: number): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log(`ROOM GROUP CHAT TEST - ${userCount} USERS`);
  console.log('='.repeat(60));
  console.log(`Office: ${TEST_OFFICE}`);
  console.log(`Room: ${TEST_ROOM}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Log test start
  logObservation('test-start', `Room Chat Test (${userCount} users) Started`, {
    userCount,
    office: TEST_OFFICE,
    room: TEST_ROOM,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser
  const { browser, context } = await createBrowser();
  let diagnostics: DiagnosticsHandle | null = null;

  const results: Omit<GroupTestResults, 'allPassed'> = {
    accountsCreated: {},
    navigationSuccess: {},
    chatEnabled: false,
    chatTabSwitch: {},
    messagingResults: [],
  };

  try {
    // ========== STEP 1: Create Users ==========
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP 1: Creating ${userCount} Users`);
    console.log('─'.repeat(50));

    const users = await createNUsers(context, userCount, 'room_', uxTracker);

    for (const user of users) {
      results.accountsCreated[user.username] = true;
    }

    // Start diagnostics on first user's page
    diagnostics = await startDiagnostics(users[0].page, {
      whiteScreenCheckInterval: 3000,
      realTimePrint: true,
      realTimeOnlyErrors: true,
    });

    // ========== STEP 2: Navigate to Office ==========
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP 2: Navigate All to Office "${TEST_OFFICE}"`);
    console.log('─'.repeat(50));

    await navigateAllToOffice(users, TEST_OFFICE, uxTracker);
    await sleep(2000);

    // ========== STEP 3: Navigate to Room ==========
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP 3: Navigate All to Room "${TEST_ROOM}"`);
    console.log('─'.repeat(50));

    results.navigationSuccess = await navigateAllToRoom(users, TEST_ROOM, uxTracker);
    await sleep(2000);

    // ========== STEP 4: Check Chat Enabled ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Check Chat Enabled');
    console.log('─'.repeat(50));

    results.chatEnabled = await isChatEnabled(users[0].page, users[0].username);

    if (!results.chatEnabled) {
      console.log(`  Room "${TEST_ROOM}" does not have chat enabled`);
      uxTracker.log('suggestion', 'functional', `Room "${TEST_ROOM}" chat is not enabled`);
    }

    // ========== STEP 5: Switch to Chat Tab ==========
    if (results.chatEnabled) {
      console.log('\n' + '─'.repeat(50));
      console.log('STEP 5: Switch All to Chat Tab');
      console.log('─'.repeat(50));

      results.chatTabSwitch = await switchAllToChatTab(users, uxTracker);
      await sleep(2000);

      // ========== STEP 6: Test Bidirectional Messaging ==========
      console.log('\n' + '─'.repeat(50));
      console.log('STEP 6: Bidirectional Messaging Test');
      console.log('─'.repeat(50));

      results.messagingResults = await testBidirectionalMessaging(
        users,
        'room',
        uxTracker
      );
    }

    // Final screenshots
    for (const user of users) {
      await takeScreenshot(user.page, `FINAL_room_${userCount}users_${user.username}`);
    }

    // Calculate and print results
    const allPassed = calculateAllPassed(results);
    const fullResults: GroupTestResults = { ...results, allPassed };

    printGroupTestResults(
      {
        userCount,
        groupType: 'room',
        roomName: TEST_ROOM,
        uxTracker,
      },
      fullResults
    );

    // Log UX issues
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

    // Log test result
    logObservation('test-complete', `Room Chat Test (${userCount} users) ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results: fullResults,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    // Write report
    writeTestReport(`ROOM_CHAT_${userCount}USERS_REPORT.json`, {
      userCount,
      office: TEST_OFFICE,
      room: TEST_ROOM,
      users: users.map(u => u.username),
      results: fullResults,
      uxIssues,
      passed: allPassed,
    });

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', `Room Chat Test (${userCount} users) Error`, {
      error: String(error),
    }, 'failed');
    return false;
  } finally {
    // Stop diagnostics
    if (diagnostics) {
      console.log('\n  Stopping diagnostics...');
      const report = await diagnostics.stop();
      if (report.hadWhiteScreen) {
        console.log('\n  WARNING: WHITE SCREEN DETECTED');
      }
      if (report.summary.pageErrorCount > 0) {
        console.log(`\n  WARNING: ${report.summary.pageErrorCount} page error(s) detected`);
      }
    }

    await browser.close();
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(70));
  console.log('ROOM GROUP CHAT INTEGRATION TEST - PARAMETERIZED');
  console.log('='.repeat(70));
  console.log(`User counts: ${USER_COUNTS.join(', ')}`);
  console.log(`Office: ${TEST_OFFICE}`);
  console.log(`Room: ${TEST_ROOM}`);
  console.log('');

  // Restart backend services for clean state
  await restartBackendServices();
  await waitForServicesAlive();

  let allPassed = true;

  for (const userCount of USER_COUNTS) {
    // NOTE: We don't restart services between iterations because:
    // 1. It causes "Address already in use" port conflicts
    // 2. Each test creates new users anyway
    // 3. The initial restart provides clean state

    const passed = await runRoomTest(userCount);
    if (!passed) {
      allPassed = false;
    }

    // Brief pause between tests
    await sleep(3000);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`ROOM CHAT TEST SUITE: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  console.log('='.repeat(70));

  return allPassed;
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
