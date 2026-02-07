/**
 * Office Group Chat Integration Test
 *
 * Tests group chat messaging in an office with parameterized user counts (2, 3).
 * Each test creates N users and verifies bidirectional messaging between all pairs.
 */

import {
  sleep,
  createBrowser,
  takeScreenshot,
  UxIssueTracker,
  isChatEnabled,
  startDiagnostics,
  createNUsers,
  navigateAllToOffice,
  switchAllToChatTab,
  testBidirectionalMessaging,
  printGroupTestResults,
  calculateAllPassed,
  TestHarness,
  runTestMain,
  type GroupTestResults,
  type DiagnosticsHandle,
} from '../../lib/index.js';

// ============================================================================
// Configuration
// ============================================================================

// User counts to test - run tests for 2 and 3 users
const USER_COUNTS = [2, 3];

// Default office from workspaces.json config
const TEST_OFFICE = 'General';

// ============================================================================
// Test Runner
// ============================================================================

async function runOfficeTest(userCount: number): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log(`OFFICE GROUP CHAT TEST - ${userCount} USERS`);
  console.log('='.repeat(60));
  console.log(`Office: ${TEST_OFFICE}`);
  console.log('');

  // Initialize
  const uxTracker = new UxIssueTracker();

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

    const users = await createNUsers(context, userCount, 'office_', uxTracker);

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
    console.log(`STEP 2: Navigate All to "${TEST_OFFICE}"`);
    console.log('─'.repeat(50));

    results.navigationSuccess = await navigateAllToOffice(users, TEST_OFFICE, uxTracker);
    await sleep(2000);

    // ========== STEP 3: Check Chat Enabled ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Check Chat Enabled');
    console.log('─'.repeat(50));

    results.chatEnabled = await isChatEnabled(users[0].page, users[0].username);

    if (!results.chatEnabled) {
      console.log(`  Office "${TEST_OFFICE}" does not have chat enabled`);
      uxTracker.log('suggestion', 'functional', `Office "${TEST_OFFICE}" chat is not enabled`);
    }

    // ========== STEP 4: Switch to Chat Tab ==========
    if (results.chatEnabled) {
      console.log('\n' + '─'.repeat(50));
      console.log('STEP 4: Switch All to Chat Tab');
      console.log('─'.repeat(50));

      results.chatTabSwitch = await switchAllToChatTab(users, uxTracker);
      await sleep(2000);

      // ========== STEP 5: Test Bidirectional Messaging ==========
      console.log('\n' + '─'.repeat(50));
      console.log('STEP 5: Bidirectional Messaging Test');
      console.log('─'.repeat(50));

      results.messagingResults = await testBidirectionalMessaging(
        users,
        'office',
        uxTracker
      );
    }

    // Final screenshots
    for (const user of users) {
      await takeScreenshot(user.page, `FINAL_office_${userCount}users_${user.username}`);
    }

    // Calculate and print results
    const allPassed = calculateAllPassed(results);
    const fullResults: GroupTestResults = { ...results, allPassed };

    printGroupTestResults(
      {
        userCount,
        groupType: 'office',
        officeName: TEST_OFFICE,
        uxTracker,
      },
      fullResults
    );

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
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
  const harness = await TestHarness.create({
    testName: 'Office Group Chat Integration Test',
    reportFileName: 'OFFICE_CHAT_REPORT.json',
    metadata: { userCounts: USER_COUNTS, office: TEST_OFFICE },
    restartBackend: true,
  });

  console.log(`User counts: ${USER_COUNTS.join(', ')}`);
  console.log(`Office: ${TEST_OFFICE}`);
  console.log('');

  let allPassed = true;

  for (const userCount of USER_COUNTS) {
    // NOTE: We don't restart services between iterations because:
    // 1. It causes "Address already in use" port conflicts
    // 2. Each test creates new users anyway
    // 3. The initial restart provides clean state

    const passed = await runOfficeTest(userCount);
    if (!passed) {
      allPassed = false;
    }

    // Brief pause between tests
    await sleep(3000);
  }

  harness.finalize(allPassed, { userCounts: USER_COUNTS, office: TEST_OFFICE });

  return allPassed;
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
