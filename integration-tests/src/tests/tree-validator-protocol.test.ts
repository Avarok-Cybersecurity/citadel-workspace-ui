/**
 * Tree Validator Integration Test
 *
 * Tests tree integrity validation through UI operations:
 * 1. Node Creation - Offices and rooms can be created
 * 2. Hierarchy Maintenance - Rooms appear under their parent office
 * 3. Cascade Delete - Deleting office deletes its rooms
 * 4. Node Verification - Nodes can be found/not found as expected
 *
 * Note: Protocol-level edge cases (cycle detection, orphan prevention) are
 * validated by the backend TreeValidator. This test validates the UI layer
 * properly uses the tree operations.
 */

import type { Page, Browser } from 'playwright';
import {
  sleep,
  createBrowser,
  ensureScreenshotsDir,
  createAccount,
  takeScreenshot,
  waitForServicesAlive,
  writeTestReport,
  UxIssueTracker,
  waitForWorkspaceLoaded,
  restartBackendServices,
  startDiagnostics,
  // UI-based tree helpers
  getWorkspaceRootId,
  createOfficeViaUI,
  createRoomViaUI,
  navigateToOfficeViaUI,
  deleteNodeViaUI,
  nodeExistsInUI,
  type DiagnosticsHandle,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  // Setup
  accountCreation: boolean;
  workspaceLoaded: boolean;
  workspaceRootFound: boolean;

  // Node Creation Tests
  officeCreated: boolean;
  roomCreated: boolean;
  roomUnderCorrectParent: boolean;

  // Node Verification Tests
  officeExistsAfterCreate: boolean;
  roomExistsAfterCreate: boolean;

  // Cascade Delete Tests
  officeDeletedWithCascade: boolean;
  roomDeletedByCascade: boolean;

  // Secondary Creation Tests (after delete)
  secondOfficeCreated: boolean;
  leafNodeDeletedWithoutCascade: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const ADMIN_USER = `tree_validator_${timestamp}`;
const TEST_OFFICE = `TestOffice_${timestamp}`;
const TEST_ROOM = `TestRoom_${timestamp}`;
const TEST_OFFICE_2 = `TestOffice2_${timestamp}`;

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  console.log('============================================================');
  console.log('TREE VALIDATOR INTEGRATION TEST');
  console.log('============================================================');
  console.log(`Admin User: ${ADMIN_USER}`);
  console.log('');

  const results: TestResults = {
    accountCreation: false,
    workspaceLoaded: false,
    workspaceRootFound: false,
    officeCreated: false,
    roomCreated: false,
    roomUnderCorrectParent: false,
    officeExistsAfterCreate: false,
    roomExistsAfterCreate: false,
    officeDeletedWithCascade: false,
    roomDeletedByCascade: false,
    secondOfficeCreated: false,
    leafNodeDeletedWithoutCascade: false,
  };

  const uxTracker = new UxIssueTracker();
  let browser: Browser | null = null;
  let page: Page | null = null;
  let diagnostics: DiagnosticsHandle | null = null;

  try {
    await ensureScreenshotsDir();

    // ========================================================================
    // Restart services for clean state
    // ========================================================================
    console.log('\n============================================================');
    console.log('RESTARTING BACKEND SERVICES FOR CLEAN STATE');
    console.log('============================================================\n');
    await restartBackendServices();
    await waitForServicesAlive();

    // Create browser
    const setup = await createBrowser();
    browser = setup.browser;
    page = await setup.context.newPage();

    // Start diagnostics
    diagnostics = await startDiagnostics(page);

    // ========================================================================
    // STEP 1: Create Admin Account
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 1: Create Admin Account');
    console.log('-'.repeat(50));

    results.accountCreation = await createAccount(page, ADMIN_USER, {
      isFirstUser: true,
    });

    if (!results.accountCreation) {
      throw new Error('Failed to create admin account');
    }

    await waitForWorkspaceLoaded(page);
    results.workspaceLoaded = true;
    await takeScreenshot(page, `${ADMIN_USER}_admin_ready`);

    // ========================================================================
    // STEP 2: Get Workspace Root ID
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 2: Get Workspace Root ID');
    console.log('-'.repeat(50));

    const workspaceRootId = await getWorkspaceRootId(page);
    results.workspaceRootFound = workspaceRootId !== null;
    console.log(`  Workspace root ID: ${workspaceRootId || 'NOT FOUND (using placeholder)'}`);

    // ========================================================================
    // STEP 3: Create Office Node
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 3: Create Office Node');
    console.log('-'.repeat(50));

    const officeResult = await createOfficeViaUI(page, TEST_OFFICE, 'Test office description');
    results.officeCreated = officeResult.success;
    console.log(`  Office creation: ${results.officeCreated ? 'PASS' : 'FAIL'}`);

    await takeScreenshot(page, `${ADMIN_USER}_office_created`);

    // ========================================================================
    // STEP 4: Verify Office Exists
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 4: Verify Office Exists');
    console.log('-'.repeat(50));

    results.officeExistsAfterCreate = await nodeExistsInUI(page, TEST_OFFICE);
    console.log(`  Office exists: ${results.officeExistsAfterCreate ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // STEP 5: Navigate to Office and Create Room
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 5: Navigate to Office and Create Room');
    console.log('-'.repeat(50));

    if (results.officeCreated) {
      const navigated = await navigateToOfficeViaUI(page, TEST_OFFICE);
      console.log(`  Navigation to office: ${navigated ? 'PASS' : 'FAIL'}`);

      if (navigated) {
        await sleep(1000);
        const roomResult = await createRoomViaUI(page, TEST_ROOM, 'Test room description');
        results.roomCreated = roomResult.success;
        console.log(`  Room creation: ${results.roomCreated ? 'PASS' : 'FAIL'}`);

        // Verify room is in the sidebar (under the office context)
        results.roomUnderCorrectParent = await nodeExistsInUI(page, TEST_ROOM);
        console.log(`  Room under correct parent: ${results.roomUnderCorrectParent ? 'PASS' : 'FAIL'}`);
      }
    }

    await takeScreenshot(page, `${ADMIN_USER}_room_created`);

    // ========================================================================
    // STEP 6: Verify Room Exists
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 6: Verify Room Exists');
    console.log('-'.repeat(50));

    results.roomExistsAfterCreate = await nodeExistsInUI(page, TEST_ROOM);
    console.log(`  Room exists: ${results.roomExistsAfterCreate ? 'PASS' : 'FAIL'}`);

    // ========================================================================
    // STEP 7: Delete Office (Cascade Delete)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 7: Delete Office (Cascade Delete)');
    console.log('-'.repeat(50));

    if (results.officeCreated) {
      const deleteResult = await deleteNodeViaUI(page, TEST_OFFICE, 'Office');
      results.officeDeletedWithCascade = deleteResult.success;
      console.log(`  Office deleted: ${results.officeDeletedWithCascade ? 'PASS' : 'FAIL'}`);

      // Verify room was also deleted (cascade)
      await sleep(1000);
      const roomStillExists = await nodeExistsInUI(page, TEST_ROOM);
      results.roomDeletedByCascade = !roomStillExists;
      console.log(`  Room deleted by cascade: ${results.roomDeletedByCascade ? 'PASS' : 'FAIL'}`);
    }

    await takeScreenshot(page, `${ADMIN_USER}_after_cascade_delete`);

    // ========================================================================
    // STEP 8: Create Second Office (Verify Tree Still Works)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 8: Create Second Office (Verify Tree Still Works)');
    console.log('-'.repeat(50));

    const office2Result = await createOfficeViaUI(page, TEST_OFFICE_2, 'Second test office');
    results.secondOfficeCreated = office2Result.success;
    console.log(`  Second office created: ${results.secondOfficeCreated ? 'PASS' : 'FAIL'}`);

    await takeScreenshot(page, `${ADMIN_USER}_second_office`);

    // ========================================================================
    // STEP 9: Delete Leaf Node (No Cascade Needed)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('STEP 9: Delete Leaf Node (No Cascade Needed)');
    console.log('-'.repeat(50));

    if (results.secondOfficeCreated) {
      // Office with no children should delete cleanly
      const deleteResult = await deleteNodeViaUI(page, TEST_OFFICE_2, 'Office');
      results.leafNodeDeletedWithoutCascade = deleteResult.success;
      console.log(`  Leaf node deleted: ${results.leafNodeDeletedWithoutCascade ? 'PASS' : 'FAIL'}`);
    }

    await takeScreenshot(page, `${ADMIN_USER}_final_state`);

  } catch (error) {
    console.error('\n[TEST ERROR]', error);
    uxTracker.log('critical', 'functional', `Test crashed: ${error}`);

    if (page) {
      await takeScreenshot(page, 'ERROR_state');
    }
  } finally {
    // Stop diagnostics
    if (diagnostics) {
      await diagnostics.stop();
    }

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    console.log('\nSetup:');
    console.log(`  Account Creation:           ${results.accountCreation ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Loaded:           ${results.workspaceLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Root Found:       ${results.workspaceRootFound ? 'PASS' : 'SKIP'}`);

    console.log('\nNode Creation:');
    console.log(`  Office Created:             ${results.officeCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Room Created:               ${results.roomCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Room Under Correct Parent:  ${results.roomUnderCorrectParent ? 'PASS' : 'FAIL'}`);

    console.log('\nNode Verification:');
    console.log(`  Office Exists After Create: ${results.officeExistsAfterCreate ? 'PASS' : 'FAIL'}`);
    console.log(`  Room Exists After Create:   ${results.roomExistsAfterCreate ? 'PASS' : 'FAIL'}`);

    console.log('\nCascade Delete:');
    console.log(`  Office Deleted With Cascade: ${results.officeDeletedWithCascade ? 'PASS' : 'FAIL'}`);
    console.log(`  Room Deleted By Cascade:     ${results.roomDeletedByCascade ? 'PASS' : 'FAIL'}`);

    console.log('\nSecondary Tests:');
    console.log(`  Second Office Created:       ${results.secondOfficeCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Leaf Node Deleted:           ${results.leafNodeDeletedWithoutCascade ? 'PASS' : 'FAIL'}`);

    // Determine overall pass/fail
    const criticalTests = [
      results.accountCreation,
      results.workspaceLoaded,
      results.officeCreated,
      results.roomCreated,
      results.officeDeletedWithCascade,
      results.roomDeletedByCascade,
    ];

    const allCriticalPassed = criticalTests.every(Boolean);

    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL: ${allCriticalPassed ? 'TEST PASSED' : 'TEST FAILED'}`);
    console.log('='.repeat(60));

    // Write report
    await writeTestReport('TREE_VALIDATOR_TEST_REPORT.json', {
      testName: 'Tree Validator Integration Test',
      timestamp: new Date().toISOString(),
      overallPass: allCriticalPassed,
      results,
      uxIssues: uxTracker.getIssues(),
    });

    // Keep browser open for inspection
    console.log('\nBrowser will remain open for 15 seconds for manual inspection...');
    await sleep(15000);

    if (browser) {
      await browser.close();
    }

    return allCriticalPassed;
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTest()
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unhandled test error:', error);
    process.exit(1);
  });
