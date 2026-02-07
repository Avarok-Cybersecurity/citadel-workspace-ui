/**
 * Tree Cascade Delete Integration Test
 *
 * Tests the delete behavior of the tree hierarchy:
 * 1. Leaf Node Delete - Delete room with no children
 * 2. Cascade Delete - Delete office with children (cascade: true)
 * 3. Deep Cascade Delete - Delete node with 5-level deep descendants
 * 4. Non-Cascade Delete (Must Fail) - Attempt delete with children (cascade: false)
 * 5. Delete Workspace Root (Must Fail) - Workspace root cannot be deleted
 *
 * This test validates protocol-level delete operations via tree-helpers.
 */

import type { Page, Browser } from 'playwright';
import {
  sleep,
  createBrowser,
  createAccount,
  takeScreenshot,
  waitForWorkspaceLoaded,
  startDiagnostics,
  type DiagnosticsHandle,
  // Tree helpers
  createNodeViaProtocol,
  deleteNodeViaProtocol,
  getWorkspaceRootId,
  createDeepHierarchy,
  verifyNodeExists,
  verifyNodeDeleted,
  getNodeViaProtocol,
  createSiblingNodes,
  listNodesViaProtocol,
  // Test framework
  TestHarness,
  runTestMain,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  // Setup
  accountCreation: boolean;
  workspaceLoaded: boolean;
  workspaceRootFound: boolean;

  // Test Cases
  leafNodeDelete: boolean;
  leafNodeParentUpdated: boolean;
  cascadeDeleteSingleChild: boolean;
  cascadeDeleteMultipleChildren: boolean;
  cascadeDeleteCountCorrect: boolean;
  deepCascadeDelete: boolean;
  deepCascadeCountCorrect: boolean;
  workspaceStillExists: boolean;
  nonCascadeDeleteFailed: boolean;
  childrenStillExistAfterNonCascade: boolean;
  workspaceRootDeleteFailed: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const ADMIN_USER = `cascade_admin_${timestamp}`;

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'TREE CASCADE DELETE INTEGRATION TEST',
    reportFileName: 'TREE_CASCADE_DELETE_TEST_REPORT.json',
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`Admin User: ${ADMIN_USER}`);
  console.log('');

  const results: TestResults = {
    accountCreation: false,
    workspaceLoaded: false,
    workspaceRootFound: false,
    leafNodeDelete: false,
    leafNodeParentUpdated: false,
    cascadeDeleteSingleChild: false,
    cascadeDeleteMultipleChildren: false,
    cascadeDeleteCountCorrect: false,
    deepCascadeDelete: false,
    deepCascadeCountCorrect: false,
    workspaceStillExists: false,
    nonCascadeDeleteFailed: false,
    childrenStillExistAfterNonCascade: false,
    workspaceRootDeleteFailed: false,
  };

  let browser: Browser | null = null;
  let page: Page | null = null;
  let diagnostics: DiagnosticsHandle | null = null;
  let workspaceRootId: string | null = null;

  try {

    // Create browser
    const setup = await createBrowser();
    browser = setup.browser;
    page = await setup.context.newPage();

    // Start diagnostics
    diagnostics = await startDiagnostics(page);

    // ========================================================================
    // SETUP: Create Admin Account
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('SETUP: Create Admin Account');
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

    // Get workspace root ID
    workspaceRootId = await getWorkspaceRootId(page);
    results.workspaceRootFound = workspaceRootId !== null;
    console.log(`  Workspace root ID: ${workspaceRootId || 'NOT FOUND'}`);

    if (!workspaceRootId) {
      throw new Error('Failed to get workspace root ID');
    }

    // ========================================================================
    // TEST 1: Leaf Node Delete
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('TEST 1: Leaf Node Delete');
    console.log('-'.repeat(50));

    // Create an office
    const officeResult = await createNodeViaProtocol(
      page,
      workspaceRootId,
      { Child: 'Office' },
      `TestOffice_Leaf_${timestamp}`,
      'Office for leaf delete test'
    );

    if (!officeResult.success || !officeResult.nodeId) {
      console.log('  ERROR: Failed to create test office');
    } else {
      const officeId = officeResult.nodeId;
      console.log(`  Created office: ${officeId}`);

      // Create a room (leaf node)
      const roomResult = await createNodeViaProtocol(
        page,
        officeId,
        { Child: 'Room' },
        `TestRoom_Leaf_${timestamp}`,
        'Leaf room to delete'
      );

      if (!roomResult.success || !roomResult.nodeId) {
        console.log('  ERROR: Failed to create test room');
      } else {
        const roomId = roomResult.nodeId;
        console.log(`  Created leaf room: ${roomId}`);

        // Delete the leaf room (no children)
        const deleteResult = await deleteNodeViaProtocol(page, roomId, false);
        results.leafNodeDelete = deleteResult.success;
        console.log(`  Leaf delete result: ${deleteResult.success ? 'SUCCESS' : 'FAILED'}`);

        if (deleteResult.success) {
          // Verify room is deleted
          const roomDeleted = await verifyNodeDeleted(page, roomId);
          console.log(`  Room verified deleted: ${roomDeleted}`);

          // Verify parent's children list is updated
          const parentNode = await getNodeViaProtocol(page, officeId);
          if (parentNode) {
            const childStillListed = parentNode.children.includes(roomId);
            results.leafNodeParentUpdated = !childStillListed;
            console.log(`  Parent children updated: ${!childStillListed}`);
          }
        }

        // Cleanup: delete the test office
        await deleteNodeViaProtocol(page, officeId, true);
      }
    }

    await takeScreenshot(page, 'test1_leaf_delete');

    // ========================================================================
    // TEST 2: Cascade Delete (Single Child)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('TEST 2: Cascade Delete (Single Child)');
    console.log('-'.repeat(50));

    // Create office with 1 room
    const office2Result = await createNodeViaProtocol(
      page,
      workspaceRootId,
      { Child: 'Office' },
      `TestOffice_SingleChild_${timestamp}`,
      'Office with single child for cascade test'
    );

    if (office2Result.success && office2Result.nodeId) {
      const officeId = office2Result.nodeId;
      console.log(`  Created office: ${officeId}`);

      const room2Result = await createNodeViaProtocol(
        page,
        officeId,
        { Child: 'Room' },
        `TestRoom_SingleChild_${timestamp}`,
        'Single child room'
      );

      if (room2Result.success && room2Result.nodeId) {
        const roomId = room2Result.nodeId;
        console.log(`  Created room: ${roomId}`);

        // Delete office with cascade: true
        const deleteResult = await deleteNodeViaProtocol(page, officeId, true);
        results.cascadeDeleteSingleChild = deleteResult.success;
        console.log(`  Cascade delete (single child) result: ${deleteResult.success ? 'SUCCESS' : 'FAILED'}`);

        if (deleteResult.success) {
          // Verify both office and room are deleted
          const officeDeleted = await verifyNodeDeleted(page, officeId);
          const roomDeleted = await verifyNodeDeleted(page, roomId);
          console.log(`  Office deleted: ${officeDeleted}, Room deleted: ${roomDeleted}`);

          // Verify children_deleted list
          if (deleteResult.childrenDeleted) {
            const includesRoom = deleteResult.childrenDeleted.includes(roomId);
            console.log(`  children_deleted includes room: ${includesRoom}`);
            console.log(`  children_deleted: ${JSON.stringify(deleteResult.childrenDeleted)}`);
          }
        }
      }
    }

    await takeScreenshot(page, 'test2_cascade_single');

    // ========================================================================
    // TEST 3: Cascade Delete (Multiple Children)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('TEST 3: Cascade Delete (Multiple Children)');
    console.log('-'.repeat(50));

    // Create office with multiple rooms
    const office3Result = await createNodeViaProtocol(
      page,
      workspaceRootId,
      { Child: 'Office' },
      `TestOffice_MultiChild_${timestamp}`,
      'Office with multiple children'
    );

    if (office3Result.success && office3Result.nodeId) {
      const officeId = office3Result.nodeId;
      console.log(`  Created office: ${officeId}`);

      // Create 3 rooms
      const roomIds = await createSiblingNodes(
        page,
        officeId,
        { Child: 'Room' },
        3,
        `Room_Multi_${timestamp}`
      );
      console.log(`  Created ${roomIds.length} rooms`);

      if (roomIds.length === 3) {
        // Delete office with cascade: true
        const deleteResult = await deleteNodeViaProtocol(page, officeId, true);
        results.cascadeDeleteMultipleChildren = deleteResult.success;
        console.log(`  Cascade delete (multiple children) result: ${deleteResult.success ? 'SUCCESS' : 'FAILED'}`);

        if (deleteResult.success) {
          // Verify all nodes deleted
          const officeDeleted = await verifyNodeDeleted(page, officeId);
          let allRoomsDeleted = true;
          for (const roomId of roomIds) {
            const roomDeleted = await verifyNodeDeleted(page, roomId);
            if (!roomDeleted) allRoomsDeleted = false;
          }
          console.log(`  Office deleted: ${officeDeleted}, All rooms deleted: ${allRoomsDeleted}`);

          // Verify deletion count
          const expectedCount = roomIds.length;
          const actualCount = deleteResult.childrenDeleted?.length || 0;
          results.cascadeDeleteCountCorrect = actualCount === expectedCount;
          console.log(`  Deletion count: expected=${expectedCount}, actual=${actualCount} - ${results.cascadeDeleteCountCorrect ? 'CORRECT' : 'INCORRECT'}`);
        }
      }
    }

    await takeScreenshot(page, 'test3_cascade_multiple');

    // ========================================================================
    // TEST 4: Deep Cascade Delete (5 Levels)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('TEST 4: Deep Cascade Delete (5 Levels)');
    console.log('-'.repeat(50));
    console.log('  Creating 5-level hierarchy: Workspace -> A -> B -> C -> D -> E');

    // Create a 5-level deep hierarchy
    // Note: Default schema may limit depth, but we try to create as deep as possible
    const deepNodeIds = await createDeepHierarchy(
      page,
      5,
      workspaceRootId,
      `Deep_${timestamp}`
    );

    console.log(`  Created ${deepNodeIds.length} nodes in hierarchy`);

    if (deepNodeIds.length > 0) {
      const nodeA = deepNodeIds[0];
      const remainingNodes = deepNodeIds.slice(1);

      // Verify workspace exists before delete
      const workspaceExistsBefore = await verifyNodeExists(page, workspaceRootId);
      console.log(`  Workspace exists before delete: ${workspaceExistsBefore}`);

      // Delete node A with cascade
      const deleteResult = await deleteNodeViaProtocol(page, nodeA, true);
      results.deepCascadeDelete = deleteResult.success;
      console.log(`  Deep cascade delete result: ${deleteResult.success ? 'SUCCESS' : 'FAILED'}`);

      if (deleteResult.success) {
        // Verify A and all descendants deleted
        const nodeADeleted = await verifyNodeDeleted(page, nodeA);
        console.log(`  Node A deleted: ${nodeADeleted}`);

        let allDescendantsDeleted = true;
        for (const nodeId of remainingNodes) {
          const nodeDeleted = await verifyNodeDeleted(page, nodeId);
          if (!nodeDeleted) {
            console.log(`  WARNING: Node ${nodeId} still exists`);
            allDescendantsDeleted = false;
          }
        }
        console.log(`  All descendants deleted: ${allDescendantsDeleted}`);

        // Verify deletion count
        const expectedCount = remainingNodes.length;
        const actualCount = deleteResult.childrenDeleted?.length || 0;
        results.deepCascadeCountCorrect = actualCount === expectedCount;
        console.log(`  Deep deletion count: expected=${expectedCount}, actual=${actualCount} - ${results.deepCascadeCountCorrect ? 'CORRECT' : 'INCORRECT'}`);

        // Verify workspace still exists
        // Note: workspace-root is a sentinel value, not an actual stored node.
        // We verify the workspace exists by checking that we can still list offices.
        const offices = await listNodesViaProtocol(page, {
          parentId: workspaceRootId,
          entityTypes: [{ Child: 'Office' }]
        });
        results.workspaceStillExists = offices !== null;
        console.log(`  Workspace still exists (can list offices): ${results.workspaceStillExists}`);
      }
    }

    await takeScreenshot(page, 'test4_deep_cascade');

    // ========================================================================
    // TEST 5: Non-Cascade Delete (Must Fail)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('TEST 5: Non-Cascade Delete (Must Fail)');
    console.log('-'.repeat(50));

    // Create office with children
    const office5Result = await createNodeViaProtocol(
      page,
      workspaceRootId,
      { Child: 'Office' },
      `TestOffice_NoCascade_${timestamp}`,
      'Office for non-cascade delete test'
    );

    if (office5Result.success && office5Result.nodeId) {
      const officeId = office5Result.nodeId;
      console.log(`  Created office: ${officeId}`);

      const roomResult = await createNodeViaProtocol(
        page,
        officeId,
        { Child: 'Room' },
        `TestRoom_NoCascade_${timestamp}`,
        'Room that should prevent parent deletion'
      );

      if (roomResult.success && roomResult.nodeId) {
        const roomId = roomResult.nodeId;
        console.log(`  Created room: ${roomId}`);

        // Attempt delete office with cascade: false (should fail)
        const deleteResult = await deleteNodeViaProtocol(page, officeId, false);
        results.nonCascadeDeleteFailed = !deleteResult.success;
        console.log(`  Non-cascade delete result: ${deleteResult.success ? 'SUCCESS (BAD)' : 'FAILED (EXPECTED)'}`);

        if (!deleteResult.success) {
          // Verify error message mentions children
          const errorMentionsChildren = deleteResult.error?.toLowerCase().includes('children') ||
            deleteResult.error?.toLowerCase().includes('has children') ||
            deleteResult.error?.toLowerCase().includes('not empty');
          console.log(`  Error mentions children: ${errorMentionsChildren}`);
          console.log(`  Error message: ${deleteResult.error}`);
        }

        // Verify office and children still exist
        const officeExists = await verifyNodeExists(page, officeId);
        const roomExists = await verifyNodeExists(page, roomId);
        results.childrenStillExistAfterNonCascade = officeExists && roomExists;
        console.log(`  Office still exists: ${officeExists}, Room still exists: ${roomExists}`);

        // Cleanup
        await deleteNodeViaProtocol(page, officeId, true);
      }
    }

    await takeScreenshot(page, 'test5_non_cascade_fail');

    // ========================================================================
    // TEST 6: Delete Workspace Root (Must Fail)
    // ========================================================================
    console.log('\n' + '-'.repeat(50));
    console.log('TEST 6: Delete Workspace Root (Must Fail)');
    console.log('-'.repeat(50));

    // Attempt to delete workspace root
    const deleteRootResult = await deleteNodeViaProtocol(page, workspaceRootId, true);
    results.workspaceRootDeleteFailed = !deleteRootResult.success;
    console.log(`  Delete workspace root result: ${deleteRootResult.success ? 'SUCCESS (BAD)' : 'FAILED (EXPECTED)'}`);

    if (!deleteRootResult.success) {
      // Verify error message mentions workspace root
      const errorMentionsRoot = deleteRootResult.error?.toLowerCase().includes('workspace') ||
        deleteRootResult.error?.toLowerCase().includes('root') ||
        deleteRootResult.error?.toLowerCase().includes('cannot delete');
      console.log(`  Error mentions workspace/root: ${errorMentionsRoot}`);
      console.log(`  Error message: ${deleteRootResult.error}`);
    }

    // Verify workspace root still exists
    const workspaceExists = await verifyNodeExists(page, workspaceRootId);
    console.log(`  Workspace root still exists: ${workspaceExists}`);

    await takeScreenshot(page, 'test6_root_delete_fail');

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
    console.log(`  Workspace Root Found:       ${results.workspaceRootFound ? 'PASS' : 'FAIL'}`);

    console.log('\nTest 1 - Leaf Node Delete:');
    console.log(`  Leaf Delete Success:        ${results.leafNodeDelete ? 'PASS' : 'FAIL'}`);
    console.log(`  Parent Children Updated:    ${results.leafNodeParentUpdated ? 'PASS' : 'FAIL'}`);

    console.log('\nTest 2 & 3 - Cascade Delete:');
    console.log(`  Single Child Cascade:       ${results.cascadeDeleteSingleChild ? 'PASS' : 'FAIL'}`);
    console.log(`  Multiple Children Cascade:  ${results.cascadeDeleteMultipleChildren ? 'PASS' : 'FAIL'}`);
    console.log(`  Deletion Count Correct:     ${results.cascadeDeleteCountCorrect ? 'PASS' : 'FAIL'}`);

    console.log('\nTest 4 - Deep Cascade Delete:');
    console.log(`  Deep Cascade Success:       ${results.deepCascadeDelete ? 'PASS' : 'FAIL'}`);
    console.log(`  Deep Count Correct:         ${results.deepCascadeCountCorrect ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Still Exists:     ${results.workspaceStillExists ? 'PASS' : 'FAIL'}`);

    console.log('\nTest 5 - Non-Cascade Delete (Must Fail):');
    console.log(`  Delete Blocked:             ${results.nonCascadeDeleteFailed ? 'PASS' : 'FAIL'}`);
    console.log(`  Children Still Exist:       ${results.childrenStillExistAfterNonCascade ? 'PASS' : 'FAIL'}`);

    console.log('\nTest 6 - Workspace Root Delete (Must Fail):');
    console.log(`  Root Delete Blocked:        ${results.workspaceRootDeleteFailed ? 'PASS' : 'FAIL'}`);

    // Determine overall pass/fail
    const criticalTests = [
      results.accountCreation,
      results.workspaceLoaded,
      results.workspaceRootFound,
      results.leafNodeDelete,
      results.cascadeDeleteSingleChild,
      results.cascadeDeleteMultipleChildren,
      results.nonCascadeDeleteFailed,
      results.childrenStillExistAfterNonCascade,
      results.workspaceRootDeleteFailed,
    ];

    const allCriticalPassed = criticalTests.every(Boolean);
    const overallPass = allCriticalPassed;

    // Keep browser open for inspection
    console.log('\nBrowser will remain open for 10 seconds for manual inspection...');
    await sleep(10000);

    if (browser) {
      await browser.close();
    }

    await harness.finalize(overallPass, results as unknown as Record<string, any>);

    return overallPass;
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
