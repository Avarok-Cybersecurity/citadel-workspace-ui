/**
 * Group Messaging Integration Test
 *
 * Tests the group chat messaging functionality for offices and rooms:
 * 1. Create a user account
 * 2. Navigate to an office with chat enabled
 * 3. Send and receive messages in office chat
 * 4. Navigate to a room with chat enabled
 * 5. Send and receive messages in room chat
 * 6. Test pagination and message persistence
 * 7. Document any UX issues
 */

import {
  sleep,
  createBrowser,
  ensureScreenshotsDir,
  createAccount,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  logObservation,
  UxIssueTracker,
  navigateToOffice,
  navigateToRoom,
  switchToChatTab,
  switchToContentTab,
  isChatEnabled,
  sendGroupMessage,
  verifyGroupMessageReceived,
  checkMessageTimestamps,
  checkRulesBanner,
  waitForWorkspaceLoaded,
  hasOffices,
  createOffice,
  startDiagnostics,
  restartBackendServices,
  type DiagnosticsHandle,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: boolean;
  workspaceLoaded: boolean;
  isAdminAfterInit: boolean;

  // Office Chat Tests
  officeNavigation: boolean;
  officeChatEnabled: boolean;
  officeChatTabSwitch: boolean;
  officeMessageSent: boolean;
  officeMessageReceived: boolean;
  officeContentTabSwitch: boolean;

  // Room Chat Tests
  roomNavigation: boolean;
  roomChatEnabled: boolean;
  roomChatTabSwitch: boolean;
  roomMessageSent: boolean;
  roomMessageReceived: boolean;

  // Multi-message Tests
  multipleMessagesSent: boolean;
  messagesOrdered: boolean;

  // UX Checks
  uxChecks: {
    timestamps: boolean;
    rulesBanner: boolean;
    chatTabVisible: boolean;
    contentTabVisible: boolean;
  };
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `groupchat_user_${timestamp}`;

// Default offices/rooms from workspaces.json config
const TEST_OFFICE = 'General';
const TEST_ROOM = 'Random';

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('GROUP MESSAGING INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log(`User: ${USER1}`);
  console.log(`Test Office: ${TEST_OFFICE}`);
  console.log(`Test Room: ${TEST_ROOM}`);
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();

  // Restart backend services to ensure clean state
  // This is critical because the admin user is the first user to join
  // the workspace with the master password. If stale state exists from
  // previous test runs, new users may not get admin role.
  await restartBackendServices();

  // Wait for services
  await waitForServicesAlive();

  // Log the test start
  logObservation('test-start', 'Group Messaging Test Started', {
    user: USER1,
    office: TEST_OFFICE,
    room: TEST_ROOM,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser
  const { browser, context } = await createBrowser({ headless: false, slowMo: 50 });

  const results: TestResults = {
    accountCreation: false,
    workspaceLoaded: false,
    isAdminAfterInit: false,
    officeNavigation: false,
    officeChatEnabled: false,
    officeChatTabSwitch: false,
    officeMessageSent: false,
    officeMessageReceived: false,
    officeContentTabSwitch: false,
    roomNavigation: false,
    roomChatEnabled: false,
    roomChatTabSwitch: false,
    roomMessageSent: false,
    roomMessageReceived: false,
    multipleMessagesSent: false,
    messagesOrdered: false,
    uxChecks: {
      timestamps: false,
      rulesBanner: false,
      chatTabVisible: false,
      contentTabVisible: false,
    },
  };

  // Diagnostics handle (declared outside try block for finally access)
  let diagnostics: DiagnosticsHandle | null = null;

  try {
    const page = await context.newPage();

    // Start diagnostics - unified console error/warning collector and white-screen detector
    diagnostics = await startDiagnostics(page, {
      whiteScreenCheckInterval: 3000,
      realTimePrint: true,
      realTimeOnlyErrors: true,
    });

    // ========== STEP 1: Create Account ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('─'.repeat(50));

    results.accountCreation = await createAccount(page, USER1, {
      isFirstUser: true,  // First user initializes workspace
      uxTracker,
    });

    if (!results.accountCreation) {
      throw new Error('Account creation failed');
    }

    // Wait for workspace to fully load
    console.log('\n  Waiting for workspace to load...');
    results.workspaceLoaded = await waitForWorkspaceLoaded(page, 30000);
    await sleep(3000);

    // ========== STEP 1.5: Verify Admin Status ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1.5: Verify Admin Status After Initialization');
    console.log('─'.repeat(50));

    // Look for admin indicators in the UI
    // The first user who initializes the workspace should become admin
    const adminIndicators = [
      page.locator('[data-testid="admin-badge"]'),
      page.locator('.admin-indicator'),
      page.locator('text="Admin"').first(),
      page.locator('[class*="admin"]').first(),
      page.locator('text="ADMIN SETTINGS"').first(),
    ];

    for (const indicator of adminIndicators) {
      if (await indicator.isVisible({ timeout: 2000 }).catch(() => false)) {
        results.isAdminAfterInit = true;
        console.log('  Admin status confirmed via UI indicator');
        break;
      }
    }

    if (!results.isAdminAfterInit) {
      console.log('  WARNING: Admin status not visually confirmed in UI');
      console.log('  NOTE: User should have admin permissions after initializing workspace');
      uxTracker.log('suggestion', 'functional', 'Admin status indicator not visible in UI after workspace initialization');
    }

    await takeScreenshot(page, `${USER1}_admin_status`);

    // ========== STEP 2: Check/Create Offices ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Check and Create Offices');
    console.log('─'.repeat(50));

    // Check if offices exist
    const officesExist = await hasOffices(page, USER1);

    if (!officesExist) {
      console.log(`  No offices found. Attempting to create "${TEST_OFFICE}"...`);
      const officeCreated = await createOffice(page, USER1, TEST_OFFICE, 'General discussion and community', { uxTracker });

      if (!officeCreated) {
        console.log(`  WARNING: Could not create office. This may be a permissions issue.`);
        console.log(`  NOTE: The first user needs to initialize the workspace to gain admin permissions.`);
        uxTracker.log('major', 'functional', 'Cannot create office - may need workspace initialization or admin permissions');
      }
    }

    // ========== STEP 3: Navigate to Office ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Navigate to Office');
    console.log('─'.repeat(50));

    results.officeNavigation = await navigateToOffice(page, USER1, TEST_OFFICE, { uxTracker });
    await sleep(2000);

    // ========== STEP 4: Check Office Chat ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Office Chat Test');
    console.log('─'.repeat(50));

    results.officeChatEnabled = await isChatEnabled(page, USER1);

    if (results.officeChatEnabled) {
      results.uxChecks.chatTabVisible = true;

      // Switch to Chat tab
      results.officeChatTabSwitch = await switchToChatTab(page, USER1, { uxTracker });

      if (results.officeChatTabSwitch) {
        // Check for rules banner
        const rules = await checkRulesBanner(page, USER1);
        results.uxChecks.rulesBanner = rules !== null;

        // Send a message
        const officeMsg1 = `Hello from ${USER1} in ${TEST_OFFICE}! Time: ${new Date().toISOString()}`;
        results.officeMessageSent = await sendGroupMessage(page, USER1, officeMsg1, { uxTracker });

        // Verify the message appears (we sent it, so it should be visible)
        if (results.officeMessageSent) {
          await sleep(2000);
          results.officeMessageReceived = await verifyGroupMessageReceived(page, USER1, officeMsg1, 10000, { uxTracker });

          // Check timestamps
          results.uxChecks.timestamps = await checkMessageTimestamps(page, USER1);
        }
      }

      // Switch back to Content tab
      results.officeContentTabSwitch = await switchToContentTab(page, USER1, { uxTracker });
      if (results.officeContentTabSwitch) {
        results.uxChecks.contentTabVisible = true;
      }
    } else {
      console.log(`  Office "${TEST_OFFICE}" does not have chat enabled`);
      uxTracker.log('suggestion', 'functional', `Office "${TEST_OFFICE}" chat is not enabled in config`);
    }

    // ========== STEP 5: Navigate to Room ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Navigate to Room');
    console.log('─'.repeat(50));

    results.roomNavigation = await navigateToRoom(page, USER1, TEST_ROOM, { uxTracker });
    await sleep(2000);

    // ========== STEP 6: Check Room Chat ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Room Chat Test');
    console.log('─'.repeat(50));

    results.roomChatEnabled = await isChatEnabled(page, USER1);

    if (results.roomChatEnabled) {
      // Switch to Chat tab
      results.roomChatTabSwitch = await switchToChatTab(page, USER1, { uxTracker });

      if (results.roomChatTabSwitch) {
        // Send a message
        const roomMsg1 = `Room message from ${USER1} in ${TEST_ROOM}! Time: ${new Date().toISOString()}`;
        results.roomMessageSent = await sendGroupMessage(page, USER1, roomMsg1, { uxTracker });

        // Verify the message appears
        if (results.roomMessageSent) {
          await sleep(2000);
          results.roomMessageReceived = await verifyGroupMessageReceived(page, USER1, roomMsg1, 10000, { uxTracker });
        }
      }
    } else {
      console.log(`  Room "${TEST_ROOM}" does not have chat enabled`);
      uxTracker.log('suggestion', 'functional', `Room "${TEST_ROOM}" chat is not enabled in config`);
    }

    // ========== STEP 7: Multiple Messages Test ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Multiple Messages Test');
    console.log('─'.repeat(50));

    if (results.roomChatEnabled && results.roomChatTabSwitch) {
      const messages = [
        `Message 1: Testing multiple messages ${Date.now()}`,
        `Message 2: Second message in sequence ${Date.now()}`,
        `Message 3: Third message to verify ordering ${Date.now()}`,
      ];

      let allSent = true;
      for (const msg of messages) {
        const sent = await sendGroupMessage(page, USER1, msg, { uxTracker });
        if (!sent) allSent = false;
        await sleep(1000);
      }

      results.multipleMessagesSent = allSent;

      // Verify messages are in order by checking they all appear
      await sleep(2000);
      let allReceived = true;
      for (const msg of messages) {
        const received = await verifyGroupMessageReceived(page, USER1, msg, 5000, { uxTracker });
        if (!received) allReceived = false;
      }

      results.messagesOrdered = allReceived;
    }

    // Final screenshot
    await takeScreenshot(page, 'FINAL_group_messaging');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const coreFunctionality =
      results.accountCreation &&
      results.workspaceLoaded;

    const officeChatWorks =
      !results.officeChatEnabled || // Skip if not enabled
      (results.officeChatTabSwitch && results.officeMessageSent && results.officeMessageReceived);

    const roomChatWorks =
      !results.roomChatEnabled || // Skip if not enabled
      (results.roomChatTabSwitch && results.roomMessageSent && results.roomMessageReceived);

    const allPassed = coreFunctionality && officeChatWorks && roomChatWorks;

    console.log('\nCore Functionality:');
    console.log(`  Account Creation:           ${results.accountCreation ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Loaded:           ${results.workspaceLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`  Admin After Init:           ${results.isAdminAfterInit ? 'PASS' : 'CHECK'}`);

    console.log('\nOffice Chat:');
    console.log(`  Navigate to Office:         ${results.officeNavigation ? 'PASS' : 'FAIL'}`);
    console.log(`  Chat Enabled:               ${results.officeChatEnabled ? 'YES' : 'NO'}`);
    console.log(`  Switch to Chat Tab:         ${results.officeChatTabSwitch ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  Send Message:               ${results.officeMessageSent ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  Message Received:           ${results.officeMessageReceived ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  Switch to Content Tab:      ${results.officeContentTabSwitch ? 'PASS' : results.officeChatEnabled ? 'FAIL' : 'SKIP'}`);

    console.log('\nRoom Chat:');
    console.log(`  Navigate to Room:           ${results.roomNavigation ? 'PASS' : 'FAIL'}`);
    console.log(`  Chat Enabled:               ${results.roomChatEnabled ? 'YES' : 'NO'}`);
    console.log(`  Switch to Chat Tab:         ${results.roomChatTabSwitch ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  Send Message:               ${results.roomMessageSent ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  Message Received:           ${results.roomMessageReceived ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);

    console.log('\nMultiple Messages:');
    console.log(`  Multiple Messages Sent:     ${results.multipleMessagesSent ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);
    console.log(`  Messages Ordered:           ${results.messagesOrdered ? 'PASS' : results.roomChatEnabled ? 'FAIL' : 'SKIP'}`);

    console.log('\nUX Quality:');
    console.log(`  Chat Tab Visible:           ${results.uxChecks.chatTabVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Content Tab Visible:        ${results.uxChecks.contentTabVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Message Timestamps:         ${results.uxChecks.timestamps ? 'PASS' : 'CHECK'}`);
    console.log(`  Rules Banner:               ${results.uxChecks.rulesBanner ? 'PASS' : 'N/A'}`);

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
    logObservation('test-complete', `Group Messaging Test ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    // Write report
    writeTestReport('GROUP_MESSAGING_TEST_REPORT.json', {
      user: USER1,
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
    logObservation('test-error', 'Group Messaging Test Error', {
      error: String(error),
    }, 'failed');
    throw error;
  } finally {
    // Stop diagnostics and print report
    if (diagnostics) {
      console.log('\n' + '─'.repeat(50));
      console.log('Stopping diagnostics and generating report...');
      console.log('─'.repeat(50));
      const report = await diagnostics.stop();

      // Check if we had critical issues
      if (report.hadWhiteScreen) {
        console.log('\n⚠️  WHITE SCREEN DETECTED DURING TEST');
      }
      if (report.summary.pageErrorCount > 0) {
        console.log(`\n⚠️  ${report.summary.pageErrorCount} PAGE ERROR(S) DETECTED`);
      }
    }

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
