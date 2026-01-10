/**
 * Peer Group Chat Integration Test
 *
 * Tests custom peer group chat messaging with parameterized user counts (2, 3).
 * Each test:
 * 1. Creates N users
 * 2. Establishes P2P connections between all pairs
 * 3. User 1 creates a custom group and invites all others
 * 4. Verifies bidirectional messaging between all members
 *
 * NOTE: This test requires the custom peer group UI to be implemented:
 * - CreateGroupDialog component
 * - GroupChatPage route (/groups/:groupId)
 * - WASM bindings for groupCreate, groupInvite, groupMessage
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
  restartBackendServices,
  startDiagnostics,
  createNUsers,
  printGroupTestResults,
  calculateAllPassed,
  type GroupTestResults,
  type MessageTestResult,
  type DiagnosticsHandle,
  type UserSession,
  p2pRegister,
  acceptP2PRequest,
} from '../../lib/index.js';

// ============================================================================
// Configuration
// ============================================================================

// User counts to test - run tests for 2 and 3 users
const USER_COUNTS = [2, 3];

// Group name prefix
const GROUP_NAME_PREFIX = 'TestGroup';

// ============================================================================
// P2P Connection Helpers
// ============================================================================

/**
 * Establish P2P connections between all pairs of users.
 * For N users, this creates N*(N-1)/2 bidirectional P2P links.
 */
async function establishAllP2PConnections(
  users: UserSession[],
  uxTracker: UxIssueTracker
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  console.log(`\n  Establishing P2P connections between ${users.length} users...`);

  // For each pair (i, j) where i < j, user i registers with user j
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const user1 = users[i];
      const user2 = users[j];
      const pairKey = `${user1.username}<->${user2.username}`;

      console.log(`\n  P2P pair: ${pairKey}`);

      // User i initiates registration with User j
      const registered = await p2pRegister(
        user1.page,
        user1.username,
        user2.username,
        uxTracker
      );

      if (!registered) {
        console.log(`    P2P registration failed: ${user1.username} -> ${user2.username}`);
        results[pairKey] = false;
        continue;
      }

      // User j accepts the request
      await sleep(3000); // Wait for notification to arrive

      const accepted = await acceptP2PRequest(
        user2.page,
        user2.username,
        uxTracker
      );

      if (!accepted) {
        console.log(`    P2P accept failed: ${user2.username}`);
        results[pairKey] = false;
        continue;
      }

      results[pairKey] = true;
      console.log(`    P2P connection established: ${pairKey}`);

      await sleep(2000);
    }
  }

  return results;
}

// ============================================================================
// Group Creation Helpers
// ============================================================================

/**
 * Create a custom peer group via UI.
 * User 1 creates the group and invites all other users.
 */
async function createPeerGroup(
  creator: UserSession,
  members: UserSession[],
  groupName: string,
  uxTracker: UxIssueTracker
): Promise<string | null> {
  console.log(`\n  ${creator.username}: Creating group "${groupName}" with ${members.length} members...`);

  const page = creator.page;

  // Click "+ New Group" button in sidebar
  // The button is in the MembersSection after CONVERSATIONS header
  const newGroupBtn = page.locator('button:has-text("New Group"), button:has-text("Create Group")').first();

  if (!await newGroupBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('    New Group button not found in sidebar');
    uxTracker.log('critical', 'functional', 'New Group button not found in sidebar');
    await takeScreenshot(page, `${creator.username}_new_group_btn_not_found`);
    return null;
  }

  await newGroupBtn.click();
  await sleep(1000);

  await takeScreenshot(page, `${creator.username}_create_group_dialog`);

  // Fill in group name
  const nameInput = page.locator('input[placeholder*="group name"], input#group-name').first();
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill(groupName);
    console.log(`    Group name filled: ${groupName}`);
  } else {
    console.log('    Group name input not found');
    uxTracker.log('major', 'functional', 'Group name input not found in create dialog');
  }

  await sleep(500);

  // Add members - click "Add Member" button for each member
  for (const member of members) {
    console.log(`    Adding member: ${member.username}`);

    // Click "Add Member" button
    const addMemberBtn = page.locator('button:has-text("Add Member")').first();
    if (!await addMemberBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`    Add Member button not found for ${member.username}`);
      continue;
    }

    await addMemberBtn.click();
    await sleep(500);

    // Select the peer from the popover
    const peerOption = page.locator(`[role="option"]:has-text("${member.username}"), button:has-text("${member.username}")`).first();
    if (await peerOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await peerOption.click();
      console.log(`    Selected member: ${member.username}`);
      await sleep(500);
    } else {
      console.log(`    Peer ${member.username} not found in selector`);
      uxTracker.log('major', 'functional', `Peer ${member.username} not found in member selector`);
    }
  }

  await takeScreenshot(page, `${creator.username}_group_members_added`);

  // Click "Create Group" button
  const createBtn = page.locator('button:has-text("Create Group")').last();
  if (!await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('    Create Group button not found');
    uxTracker.log('critical', 'functional', 'Create Group button not found in dialog');
    await takeScreenshot(page, `${creator.username}_create_btn_not_found`);
    return null;
  }

  await createBtn.click();
  await sleep(3000);

  await takeScreenshot(page, `${creator.username}_group_created`);

  // Get group ID from URL or state
  // After creation, should navigate to /groups/:groupId
  const url = page.url();
  const groupIdMatch = url.match(/\/groups\/([^/]+)/);

  if (groupIdMatch) {
    const groupId = groupIdMatch[1];
    console.log(`    Group created successfully: ${groupId}`);
    return groupId;
  }

  // Alternative: Look for group in sidebar
  const groupRow = page.locator(`text="${groupName}"`).first();
  if (await groupRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`    Group "${groupName}" visible in sidebar`);
    // Return a placeholder ID - the actual ID would come from state
    return `group-${Date.now()}`;
  }

  console.log('    Could not confirm group creation');
  uxTracker.log('major', 'functional', 'Could not confirm group creation');
  return null;
}

/**
 * Navigate a user to the group chat.
 */
async function navigateToGroup(
  user: UserSession,
  groupName: string,
  uxTracker: UxIssueTracker
): Promise<boolean> {
  console.log(`\n  ${user.username}: Navigating to group "${groupName}"...`);

  const page = user.page;

  // Look for group in sidebar
  const groupRow = page.locator(`text="${groupName}"`).first();

  if (!await groupRow.isVisible({ timeout: 10000 }).catch(() => false)) {
    console.log(`    Group "${groupName}" not visible in sidebar for ${user.username}`);
    uxTracker.log('major', 'functional', `Group "${groupName}" not visible for ${user.username}`);
    await takeScreenshot(page, `${user.username}_group_not_visible`);
    return false;
  }

  await groupRow.click();
  await sleep(2000);

  await takeScreenshot(page, `${user.username}_in_group`);

  // Verify we're in the group chat
  const groupHeader = page.locator(`h2:has-text("${groupName}"), [role="heading"]:has-text("${groupName}")`).first();
  const inGroup = await groupHeader.isVisible({ timeout: 5000 }).catch(() => false);

  if (!inGroup) {
    console.log(`    Failed to navigate to group for ${user.username}`);
    return false;
  }

  console.log(`    ${user.username} now in group "${groupName}"`);
  return true;
}

/**
 * Send a message in the group chat.
 */
async function sendGroupChatMessage(
  sender: UserSession,
  message: string,
  uxTracker: UxIssueTracker
): Promise<boolean> {
  const page = sender.page;

  // Find message input
  const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]').first();

  if (!await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`    Message input not found for ${sender.username}`);
    uxTracker.log('major', 'functional', `Message input not found for ${sender.username}`);
    return false;
  }

  await messageInput.fill(message);
  await messageInput.press('Enter');

  await sleep(1000);

  // Verify message appears in chat
  const sentMessage = page.locator(`.message:has-text("${message}"), div:has-text("${message}")`).first();
  const sent = await sentMessage.isVisible({ timeout: 5000 }).catch(() => false);

  return sent;
}

/**
 * Verify a message was received in the group chat.
 */
async function verifyGroupChatMessageReceived(
  receiver: UserSession,
  message: string,
  timeoutMs: number,
  uxTracker: UxIssueTracker
): Promise<boolean> {
  const page = receiver.page;

  // Wait for message to appear
  const messageLocator = page.locator(`text="${message}"`).first();

  const received = await messageLocator.isVisible({ timeout: timeoutMs }).catch(() => false);

  if (!received) {
    console.log(`    Message not received by ${receiver.username}: "${message.substring(0, 30)}..."`);
    uxTracker.log('major', 'functional', `Message not received by ${receiver.username}`);
    await takeScreenshot(page, `${receiver.username}_message_not_received`);
  }

  return received;
}

/**
 * Test bidirectional messaging in peer group.
 */
async function testPeerGroupMessaging(
  users: UserSession[],
  uxTracker: UxIssueTracker
): Promise<MessageTestResult[]> {
  const results: MessageTestResult[] = [];

  // Test each ordered pair (sender, receiver)
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (i === j) continue; // Skip self-messaging

      const sender = users[i];
      const receiver = users[j];
      const message = `peer-group msg from ${sender.username} to ${receiver.username} @ ${Date.now()}`;

      console.log(`\n  Testing: ${sender.username} -> ${receiver.username}`);

      // Sender sends message
      const sent = await sendGroupChatMessage(sender, message, uxTracker);

      await sleep(2000);

      // Receiver verifies receipt
      let received = false;
      if (sent) {
        received = await verifyGroupChatMessageReceived(receiver, message, 15000, uxTracker);
      }

      results.push({
        sender: sender.username,
        receiver: receiver.username,
        sent,
        received,
      });

      console.log(`    Sent: ${sent ? 'PASS' : 'FAIL'}, Received: ${received ? 'PASS' : 'FAIL'}`);
    }
  }

  return results;
}

// ============================================================================
// Test Runner
// ============================================================================

async function runPeerGroupTest(userCount: number): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log(`PEER GROUP CHAT TEST - ${userCount} USERS`);
  console.log('='.repeat(60));
  console.log('');

  // Initialize
  ensureScreenshotsDir();
  const uxTracker = new UxIssueTracker();
  const groupName = `${GROUP_NAME_PREFIX}_${userCount}_${Date.now()}`;

  // Log test start
  logObservation('test-start', `Peer Group Chat Test (${userCount} users) Started`, {
    userCount,
    groupName,
    timestamp: new Date().toISOString(),
  }, 'investigating');

  // Setup browser
  const { browser, context } = await createBrowser();
  let diagnostics: DiagnosticsHandle | null = null;

  const results: Omit<GroupTestResults, 'allPassed'> & {
    p2pConnections: Record<string, boolean>;
    groupCreated: boolean;
    groupNavigation: Record<string, boolean>;
  } = {
    accountsCreated: {},
    navigationSuccess: {},
    chatEnabled: true, // Peer groups always have chat
    chatTabSwitch: {},
    messagingResults: [],
    p2pConnections: {},
    groupCreated: false,
    groupNavigation: {},
  };

  try {
    // ========== STEP 1: Create Users ==========
    console.log('\n' + '─'.repeat(50));
    console.log(`STEP 1: Creating ${userCount} Users`);
    console.log('─'.repeat(50));

    const users = await createNUsers(context, userCount, 'peergrp_', uxTracker);

    for (const user of users) {
      results.accountsCreated[user.username] = true;
    }

    // Start diagnostics on first user's page
    diagnostics = await startDiagnostics(users[0].page, {
      whiteScreenCheckInterval: 3000,
      realTimePrint: true,
      realTimeOnlyErrors: true,
    });

    // ========== STEP 2: Establish P2P Connections ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Establish P2P Connections');
    console.log('─'.repeat(50));

    results.p2pConnections = await establishAllP2PConnections(users, uxTracker);

    // Check if all P2P connections succeeded
    const allP2PConnected = Object.values(results.p2pConnections).every(v => v);
    if (!allP2PConnected) {
      console.log('\n  WARNING: Not all P2P connections established');
      uxTracker.log('major', 'functional', 'Not all P2P connections established');
    }

    // ========== STEP 3: Create Peer Group ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Create Peer Group');
    console.log('─'.repeat(50));

    // User 1 creates the group with all other users as members
    const creator = users[0];
    const members = users.slice(1);

    const groupId = await createPeerGroup(creator, members, groupName, uxTracker);
    results.groupCreated = groupId !== null;

    if (!results.groupCreated) {
      console.log('\n  FAILED: Could not create peer group');
      // Still continue to check what we can
    }

    // ========== STEP 4: All Users Navigate to Group ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Navigate All to Group');
    console.log('─'.repeat(50));

    // Creator is already in the group, navigate others
    results.groupNavigation[creator.username] = true;

    for (const member of members) {
      // Wait for invite notification to be processed
      await sleep(3000);

      results.groupNavigation[member.username] = await navigateToGroup(
        member,
        groupName,
        uxTracker
      );
    }

    // ========== STEP 5: Test Bidirectional Messaging ==========
    if (results.groupCreated) {
      console.log('\n' + '─'.repeat(50));
      console.log('STEP 5: Bidirectional Messaging Test');
      console.log('─'.repeat(50));

      results.messagingResults = await testPeerGroupMessaging(users, uxTracker);
    }

    // Final screenshots
    for (const user of users) {
      await takeScreenshot(user.page, `FINAL_peergroup_${userCount}users_${user.username}`);
    }

    // Mark navigation as success for result calculation
    for (const user of users) {
      results.navigationSuccess[user.username] = results.groupNavigation[user.username] ?? false;
      results.chatTabSwitch[user.username] = true; // No tab switch needed for peer groups
    }

    // Calculate and print results
    const allPassed = calculateAllPassed(results) && results.groupCreated;
    const fullResults: GroupTestResults = { ...results, allPassed };

    printGroupTestResults(
      {
        userCount,
        groupType: 'peer-group',
        uxTracker,
      },
      fullResults
    );

    // Additional results for peer group specific data
    console.log('\nP2P Connections:');
    for (const [pair, success] of Object.entries(results.p2pConnections)) {
      console.log(`  ${pair}: ${success ? 'PASS' : 'FAIL'}`);
    }

    console.log(`\nGroup Created: ${results.groupCreated ? 'YES' : 'NO'}`);

    console.log('\nGroup Navigation:');
    for (const [username, success] of Object.entries(results.groupNavigation)) {
      console.log(`  ${username}: ${success ? 'PASS' : 'FAIL'}`);
    }

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
    logObservation('test-complete', `Peer Group Chat Test (${userCount} users) ${allPassed ? 'PASSED' : 'FAILED'}`, {
      results: fullResults,
      uxIssuesCount: uxIssues.length,
    }, allPassed ? 'verified' : 'failed');

    // Write report
    writeTestReport(`PEER_GROUP_CHAT_${userCount}USERS_REPORT.json`, {
      userCount,
      groupName,
      users: users.map(u => u.username),
      results: { ...fullResults, p2pConnections: results.p2pConnections, groupNavigation: results.groupNavigation },
      uxIssues,
      passed: allPassed,
    });

    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    logObservation('test-error', `Peer Group Chat Test (${userCount} users) Error`, {
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
  console.log('PEER GROUP CHAT INTEGRATION TEST - PARAMETERIZED');
  console.log('='.repeat(70));
  console.log(`User counts: ${USER_COUNTS.join(', ')}`);
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

    const passed = await runPeerGroupTest(userCount);
    if (!passed) {
      allPassed = false;
    }

    // Brief pause between tests
    await sleep(3000);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`PEER GROUP CHAT TEST SUITE: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
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
