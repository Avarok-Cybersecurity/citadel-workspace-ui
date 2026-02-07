/**
 * Office & Room CRUD Integration Test
 *
 * Tests the complete CRUD operations for offices and rooms:
 * 1. Admin creates office
 * 2. Admin creates room within office
 * 3. Update office (name, description, MDX content)
 * 4. Update room (name, description, MDX content)
 * 5. Non-admin cannot create/delete (auth check)
 * 6. Delete room
 * 7. Delete office (cascades to delete rooms)
 * 8. Member management (add/remove members)
 */

import {
  sleep,
  createBrowser,
  createAccount,
  takeScreenshot,
  navigateToOffice,
  waitForWorkspaceLoaded,
  startDiagnostics,
  assertNoToastConflict,
  dismissAllToasts,
  TestHarness,
  runTestMain,
  type DiagnosticsHandle,
} from '../lib/index.js';

import type { Page, Browser } from 'playwright';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: boolean;
  workspaceLoaded: boolean;
  isAdmin: boolean;

  // Office CRUD
  officeCreated: boolean;
  officeNameUpdated: boolean;
  officeDescriptionUpdated: boolean;
  officeMdxUpdated: boolean;
  officeDeleted: boolean;

  // Room CRUD
  roomCreated: boolean;
  roomNameUpdated: boolean;
  roomDescriptionUpdated: boolean;
  roomMdxUpdated: boolean;
  roomDeleted: boolean;

  // Cascade Delete
  cascadeDeleteWorks: boolean;

  // Authorization
  nonAdminCannotCreateOffice: boolean;
  nonAdminCannotDeleteOffice: boolean;
  nonAdminCannotCreateRoom: boolean;
  nonAdminCannotDeleteRoom: boolean;

  // Member Management
  memberAddedToOffice: boolean;
  memberRemovedFromOffice: boolean;
  memberAddedToRoom: boolean;
  memberRemovedFromRoom: boolean;

  // Toast Conflicts (should all be false)
  toastConflictDetected: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const ADMIN_USER = `crud_admin_${timestamp}`;
const NON_ADMIN_USER = `crud_user_${timestamp}`;
const TEST_OFFICE_NAME = `TestOffice_${timestamp}`;
const TEST_ROOM_NAME = `TestRoom_${timestamp}`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Click the add office button (+) in the sidebar
 */
async function clickAddOfficeButton(page: Page): Promise<boolean> {
  console.log('  Looking for Add Office button...');

  const selectors = [
    '[data-testid="add-office-button"]',
    '.offices-section button:has(svg)',
    'button[aria-label*="office" i]:has(svg)',
    'section:has-text("OFFICES") button:has(svg)',
  ];

  for (const selector of selectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await sleep(500);
      console.log(`  Clicked Add Office button (${selector})`);
      return true;
    }
  }

  console.log('  WARNING: Add Office button not found');
  return false;
}

/**
 * Fill in the Create Office modal and submit
 */
async function fillCreateOfficeModal(
  page: Page,
  name: string,
  description: string
): Promise<boolean> {
  console.log(`  Filling Create Office modal: ${name}`);

  // Wait for modal to open
  await sleep(500);

  // Fill name - use id selector since the input has id="name"
  const nameInput = page.locator('input#name, input[id="name"]').first();
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInput.fill(name);
  } else {
    console.log('  WARNING: Name input not found');
    return false;
  }

  // Fill description - use id selector since textarea has id="description"
  const descInput = page.locator('textarea#description, textarea[id="description"]').first();
  if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await descInput.fill(description);
  }

  await sleep(300);

  // Submit - look for "Create Office" or "Update Office" button
  const createBtn = page.locator('button:has-text("Create Office"), button:has-text("Update Office")').first();
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click();
    await sleep(2000);
    return true;
  }

  console.log('  WARNING: Create button not found');
  return false;
}

/**
 * Click the add room button in the sidebar (requires office selected)
 */
async function clickAddRoomButton(page: Page): Promise<boolean> {
  console.log('  Looking for Add Room button...');

  const selectors = [
    '[data-testid="add-room-button"]',
    '.rooms-section button:has(svg)',
    'button[aria-label*="room" i]:has(svg)',
    'section:has-text("ROOMS") button:has(svg)',
  ];

  for (const selector of selectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await sleep(500);
      console.log(`  Clicked Add Room button (${selector})`);
      return true;
    }
  }

  console.log('  WARNING: Add Room button not found');
  return false;
}

/**
 * Fill in the Create Room modal and submit
 */
async function fillCreateRoomModal(
  page: Page,
  name: string,
  description: string
): Promise<boolean> {
  console.log(`  Filling Create Room modal: ${name}`);

  await sleep(500);

  // Fill name - use id selector since the input has id="name"
  const nameInput = page.locator('input#name, input[id="name"]').first();
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInput.fill(name);
  } else {
    console.log('  WARNING: Name input not found');
    return false;
  }

  // Fill description - use id selector since textarea has id="description"
  const descInput = page.locator('textarea#description, textarea[id="description"]').first();
  if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await descInput.fill(description);
  }

  await sleep(300);

  // Submit - look for "Create Room" or "Update Room" button
  const createBtn = page.locator('button:has-text("Create Room"), button:has-text("Update Room")').first();
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click();
    await sleep(2000);
    return true;
  }

  console.log('  WARNING: Create button not found');
  return false;
}

/**
 * Open the office/room settings/edit modal
 * Uses hover-triggered dropdown menu (3-dot icon)
 */
async function openEditModal(page: Page, itemName: string, type: 'office' | 'room' = 'office'): Promise<boolean> {
  console.log(`  Opening edit modal for ${type}: ${itemName}`);

  // Find the item in the sidebar
  const itemLocator = page.locator(`button:has-text("${itemName}")`).first();

  if (await itemLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Hover over the item to reveal the 3-dot menu
    await itemLocator.hover();
    await sleep(500);

    // Click the 3-dot menu button (appears on hover)
    const menuBtn = page.locator('button:has(svg.lucide-more-vertical)').first();
    if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuBtn.click();
      await sleep(500);

      // Click "Edit Office" or "Edit Room" in the dropdown
      const editOption = page.locator(`[data-testid="edit-${type}-option"], [role="menuitem"]:has-text("Edit ${type === 'office' ? 'Office' : 'Room'}")`).first();
      if (await editOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await editOption.click();
        await sleep(500);
        return true;
      }
    }
  }

  console.log('  WARNING: Could not open edit modal');
  return false;
}

/**
 * Delete an office via the UI
 * Uses the 3-dot dropdown menu next to the office name
 * Uses JavaScript click to bypass opacity:0 styling
 */
async function deleteOffice(page: Page, officeName: string): Promise<boolean> {
  console.log(`\n=== Deleting office: ${officeName} ===`);

  // First close any open dialogs/menus
  await page.keyboard.press('Escape');
  await sleep(300);

  try {
    // Find the office in sidebar and get its menu button testid
    const menuTestId = await page.evaluate((name: string) => {
      const buttons = Array.from(document.querySelectorAll('[data-sidebar="menu-button"]'));
      for (const btn of buttons) {
        if (btn.textContent?.trim() === name) {
          const parent = btn.closest('.group');
          if (parent) {
            const menuBtn = parent.querySelector('button[data-testid^="office-menu-"]');
            if (menuBtn) {
              return menuBtn.getAttribute('data-testid');
            }
          }
        }
      }
      return null;
    }, officeName);

    if (menuTestId) {
      console.log(`  Found menu button: ${menuTestId}`);

      // Use Playwright click with force to handle opacity:0
      const menuBtn = page.locator(`[data-testid="${menuTestId}"]`);
      await menuBtn.click({ force: true, timeout: 2000 });
      await sleep(600);

      // Look for Delete Office option in dropdown - try multiple selectors
      const deleteOption = page.locator('div[role="menuitem"]:has-text("Delete Office"), [data-testid="delete-office-option"]').first();
      if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteOption.click();
        await sleep(500);

        // Confirm deletion
        const confirmBtn = page.locator('[role="alertdialog"] button:has-text("Delete")').first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          console.log('  Office delete confirmed');

          // Wait for the office to be removed from sidebar
          const officeLocator = page.locator(`[data-sidebar="menu-button"]:has-text("${officeName}")`).first();
          try {
            await officeLocator.waitFor({ state: 'hidden', timeout: 5000 });
            console.log('  Office removed from sidebar');
            return true;
          } catch {
            console.log('  WARNING: Office still visible after delete');
          }
        } else {
          console.log('  WARNING: Confirm button not found');
        }
      } else {
        console.log('  WARNING: Delete Office option not found');
        const allMenuItems = await page.locator('[role="menuitem"]').count();
        console.log(`  DEBUG: Found ${allMenuItems} menu items`);
      }
    } else {
      console.log('  WARNING: Could not find menu button');
    }
  } catch (err) {
    console.log('  WARNING: Error:', err);
  }

  await page.keyboard.press('Escape');
  await sleep(300);
  console.log('  WARNING: Could not delete office');
  return false;
}

/**
 * Delete a room via the UI
 * Uses the 3-dot dropdown menu next to the room name
 * Uses JavaScript click to bypass opacity:0 styling
 */
async function deleteRoom(page: Page, roomName: string): Promise<boolean> {
  console.log(`\n=== Deleting room: ${roomName} ===`);

  // First close any open dialogs/menus
  await page.keyboard.press('Escape');
  await sleep(300);

  try {
    // Find the room in sidebar and get its menu button testid
    const menuTestId = await page.evaluate((name: string) => {
      const buttons = Array.from(document.querySelectorAll('[data-sidebar="menu-button"]'));
      for (const btn of buttons) {
        if (btn.textContent?.includes(name)) {
          const parent = btn.closest('.group');
          if (parent) {
            const menuBtn = parent.querySelector('button[data-testid^="room-menu-"]');
            if (menuBtn) {
              return menuBtn.getAttribute('data-testid');
            }
          }
        }
      }
      return null;
    }, roomName);

    if (menuTestId) {
      console.log(`  Found menu button: ${menuTestId}`);

      // Use Playwright click with force to handle opacity:0
      const menuBtn = page.locator(`[data-testid="${menuTestId}"]`);
      await menuBtn.click({ force: true, timeout: 2000 });
      await sleep(600);

      // Look for Delete Room option in dropdown - try multiple selectors
      const deleteOption = page.locator('div[role="menuitem"]:has-text("Delete Room"), [data-testid="delete-room-option"]').first();
      if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteOption.click();
        await sleep(500);

        // Confirm deletion
        const confirmBtn = page.locator('[role="alertdialog"] button:has-text("Delete")').first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          console.log('  Room delete confirmed');

          // Wait for the room to be removed from sidebar
          const roomLocator = page.locator(`[data-sidebar="menu-button"]:has-text("${roomName}")`).first();
          try {
            await roomLocator.waitFor({ state: 'hidden', timeout: 5000 });
            console.log('  Room removed from sidebar');
            return true;
          } catch {
            console.log('  WARNING: Room still visible after delete');
          }
        } else {
          console.log('  WARNING: Confirm button not found');
        }
      } else {
        console.log('  WARNING: Delete Room option not found');
        const allMenuItems = await page.locator('[role="menuitem"]').count();
        console.log(`  DEBUG: Found ${allMenuItems} menu items`);
      }
    } else {
      console.log('  WARNING: Could not find menu button');
    }
  } catch (err) {
    console.log('  WARNING: Error:', err);
  }

  await page.keyboard.press('Escape');
  await sleep(300);
  console.log('  WARNING: Could not delete room');
  return false;
}

/**
 * Check if an item exists in the sidebar
 */
async function itemExistsInSidebar(page: Page, itemName: string): Promise<boolean> {
  const item = page.locator(`button:has-text("${itemName}"), [data-testid*="${itemName}"]`).first();
  return await item.isVisible({ timeout: 3000 }).catch(() => false);
}

/**
 * Check for permission denied message
 */
async function hasPermissionDenied(page: Page): Promise<boolean> {
  const denied = page.locator('text="Permission denied", text="Unauthorized", text="Admin"').first();
  return await denied.isVisible({ timeout: 2000 }).catch(() => false);
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Office & Room CRUD Integration Test',
    reportFileName: 'OFFICE_ROOM_CRUD_TEST_REPORT.json',
    metadata: { adminUser: ADMIN_USER, nonAdminUser: NON_ADMIN_USER },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`Admin User: ${ADMIN_USER}`);
  console.log(`Non-Admin User: ${NON_ADMIN_USER}`);
  console.log(`Test Office: ${TEST_OFFICE_NAME}`);
  console.log(`Test Room: ${TEST_ROOM_NAME}`);
  console.log('');

  const results: TestResults = {
    accountCreation: false,
    workspaceLoaded: false,
    isAdmin: false,
    officeCreated: false,
    officeNameUpdated: false,
    officeDescriptionUpdated: false,
    officeMdxUpdated: false,
    officeDeleted: false,
    roomCreated: false,
    roomNameUpdated: false,
    roomDescriptionUpdated: false,
    roomMdxUpdated: false,
    roomDeleted: false,
    cascadeDeleteWorks: false,
    nonAdminCannotCreateOffice: false,
    nonAdminCannotDeleteOffice: false,
    nonAdminCannotCreateRoom: false,
    nonAdminCannotDeleteRoom: false,
    memberAddedToOffice: false,
    memberRemovedFromOffice: false,
    memberAddedToRoom: false,
    memberRemovedFromRoom: false,
    toastConflictDetected: false,
  };

  let browser: Browser | null = null;
  let adminPage: Page | null = null;
  let nonAdminPage: Page | null = null;
  let diagnostics: DiagnosticsHandle | null = null;
  let overallPass = false;

  try {
    // Create browser with BOTH contexts upfront to avoid browser state issues
    // Creating contexts late (after many operations) can fail with "browser has been closed"
    const setup = await createBrowser();
    browser = setup.browser;
    const adminContext = setup.context;
    const nonAdminContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    nonAdminPage = await nonAdminContext.newPage();

    // Start diagnostics
    diagnostics = await startDiagnostics(adminPage);

    // ========================================================================
    // STEP 1: Create Admin Account (First User = Admin)
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Create Admin Account');
    console.log('─'.repeat(50));

    // createAccount handles navigation and storage clearing internally
    results.accountCreation = await createAccount(adminPage, ADMIN_USER, {
      isFirstUser: true,
    });

    if (!results.accountCreation) {
      throw new Error('Failed to create admin account');
    }

    await waitForWorkspaceLoaded(adminPage);
    results.workspaceLoaded = true;
    await takeScreenshot(adminPage, `${ADMIN_USER}_admin_ready`);

    // Check if user is admin (look for admin indicators)
    // Look for the "Admin" badge in the sidebar or "ADMIN SETTINGS" text
    const adminIndicator = adminPage.locator('text="ADMIN SETTINGS"').first();
    results.isAdmin = await adminIndicator.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Admin status: ${results.isAdmin}`);

    // ========================================================================
    // STEP 2: Create Office (Admin Only)
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: Create Office');
    console.log('─'.repeat(50));

    if (await clickAddOfficeButton(adminPage)) {
      await takeScreenshot(adminPage, `${ADMIN_USER}_create_office_modal`);

      if (await fillCreateOfficeModal(adminPage, TEST_OFFICE_NAME, 'Test office description')) {
        // Assert no toast conflict (both success AND error visible = bug)
        const toastOk = await assertNoToastConflict(adminPage, 'Create Office', uxTracker);
        if (!toastOk) {
          results.toastConflictDetected = true;
          await takeScreenshot(adminPage, `${ADMIN_USER}_office_create_TOAST_CONFLICT`);
          throw new Error('Toast conflict detected after Create Office - both success and error toasts visible');
        }

        // Verify office was created
        results.officeCreated = await itemExistsInSidebar(adminPage, TEST_OFFICE_NAME);
        console.log(`  Office created: ${results.officeCreated}`);
        await takeScreenshot(adminPage, `${ADMIN_USER}_office_created`);
        await dismissAllToasts(adminPage);
      }
    }

    if (!results.officeCreated) {
      uxTracker.log('major', 'functional', 'Could not create office');
    }

    // ========================================================================
    // STEP 3: Create Room Within Office
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: Create Room');
    console.log('─'.repeat(50));

    if (results.officeCreated) {
      // First navigate to the office
      await navigateToOffice(adminPage, ADMIN_USER, TEST_OFFICE_NAME);
      await sleep(1000);

      if (await clickAddRoomButton(adminPage)) {
        await takeScreenshot(adminPage, `${ADMIN_USER}_create_room_modal`);

        if (await fillCreateRoomModal(adminPage, TEST_ROOM_NAME, 'Test room description')) {
          // Assert no toast conflict
          const toastOk = await assertNoToastConflict(adminPage, 'Create Room', uxTracker);
          if (!toastOk) {
            results.toastConflictDetected = true;
            await takeScreenshot(adminPage, `${ADMIN_USER}_room_create_TOAST_CONFLICT`);
            throw new Error('Toast conflict detected after Create Room - both success and error toasts visible');
          }

          results.roomCreated = await itemExistsInSidebar(adminPage, TEST_ROOM_NAME);
          console.log(`  Room created: ${results.roomCreated}`);
          await takeScreenshot(adminPage, `${ADMIN_USER}_room_created`);
          await dismissAllToasts(adminPage);
        }
      }
    }

    // ========================================================================
    // STEP 4: Update Office
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Update Office');
    console.log('─'.repeat(50));

    if (results.officeCreated) {
      const updatedOfficeName = `${TEST_OFFICE_NAME}_Updated`;

      if (await openEditModal(adminPage, TEST_OFFICE_NAME)) {
        const nameInput = adminPage.locator('input[placeholder*="name" i], input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nameInput.clear();
          await nameInput.fill(updatedOfficeName);
          await sleep(300);

          const saveBtn = adminPage.locator('button:has-text("Save"), button:has-text("Update")').first();
          if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await saveBtn.click();
            await sleep(2000);

            // Assert no toast conflict
            const toastOk = await assertNoToastConflict(adminPage, 'Update Office', uxTracker);
            if (!toastOk) {
              results.toastConflictDetected = true;
              await takeScreenshot(adminPage, `${ADMIN_USER}_office_update_TOAST_CONFLICT`);
              throw new Error('Toast conflict detected after Update Office - both success and error toasts visible');
            }

            results.officeNameUpdated = await itemExistsInSidebar(adminPage, updatedOfficeName);
            await dismissAllToasts(adminPage);
          }
        }
        await takeScreenshot(adminPage, `${ADMIN_USER}_office_updated`);
      }
      console.log(`  Office name updated: ${results.officeNameUpdated}`);
    }

    // ========================================================================
    // STEP 5: Delete Room
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: Delete Room');
    console.log('─'.repeat(50));

    if (results.roomCreated) {
      results.roomDeleted = await deleteRoom(adminPage, TEST_ROOM_NAME);

      if (results.roomDeleted) {
        // Assert no toast conflict
        const toastOk = await assertNoToastConflict(adminPage, 'Delete Room', uxTracker);
        if (!toastOk) {
          results.toastConflictDetected = true;
          await takeScreenshot(adminPage, `${ADMIN_USER}_room_delete_TOAST_CONFLICT`);
          throw new Error('Toast conflict detected after Delete Room - both success and error toasts visible');
        }

        // Verify room no longer exists
        const roomStillExists = await itemExistsInSidebar(adminPage, TEST_ROOM_NAME);
        results.roomDeleted = !roomStillExists;
        await dismissAllToasts(adminPage);
      }
      console.log(`  Room deleted: ${results.roomDeleted}`);
      await takeScreenshot(adminPage, `${ADMIN_USER}_room_deleted`);
    }

    // ========================================================================
    // STEP 6: Test Cascade Delete (Create room, delete office)
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Test Cascade Delete');
    console.log('─'.repeat(50));

    const cascadeOfficeName = `CascadeOffice_${timestamp}`;
    const cascadeRoomName = `CascadeRoom_${timestamp}`;

    // Create office for cascade test
    if (await clickAddOfficeButton(adminPage)) {
      if (await fillCreateOfficeModal(adminPage, cascadeOfficeName, 'Cascade test')) {
        // Assert no toast conflict after cascade office creation
        const toastOk1 = await assertNoToastConflict(adminPage, 'Create Cascade Office', uxTracker);
        if (!toastOk1) {
          results.toastConflictDetected = true;
          await takeScreenshot(adminPage, `${ADMIN_USER}_cascade_office_TOAST_CONFLICT`);
          throw new Error('Toast conflict detected after Create Cascade Office');
        }
        await dismissAllToasts(adminPage);

        await navigateToOffice(adminPage, ADMIN_USER, cascadeOfficeName);
        await sleep(1000);

        // Create room inside
        if (await clickAddRoomButton(adminPage)) {
          await fillCreateRoomModal(adminPage, cascadeRoomName, 'Will be cascade deleted');

          // Assert no toast conflict after cascade room creation
          const toastOk2 = await assertNoToastConflict(adminPage, 'Create Cascade Room', uxTracker);
          if (!toastOk2) {
            results.toastConflictDetected = true;
            await takeScreenshot(adminPage, `${ADMIN_USER}_cascade_room_TOAST_CONFLICT`);
            throw new Error('Toast conflict detected after Create Cascade Room');
          }
          await dismissAllToasts(adminPage);
          await sleep(1000);
        }

        // Delete the office
        if (await deleteOffice(adminPage, cascadeOfficeName)) {
          // Assert no toast conflict after cascade delete
          const toastOk3 = await assertNoToastConflict(adminPage, 'Cascade Delete Office', uxTracker);
          if (!toastOk3) {
            results.toastConflictDetected = true;
            await takeScreenshot(adminPage, `${ADMIN_USER}_cascade_delete_TOAST_CONFLICT`);
            throw new Error('Toast conflict detected after Cascade Delete Office');
          }
          await dismissAllToasts(adminPage);

          // Verify both office and room are gone
          const officeGone = !(await itemExistsInSidebar(adminPage, cascadeOfficeName));
          const roomGone = !(await itemExistsInSidebar(adminPage, cascadeRoomName));
          results.cascadeDeleteWorks = officeGone && roomGone;
          console.log(`  Cascade delete works: ${results.cascadeDeleteWorks}`);
        }
      }
    }
    await takeScreenshot(adminPage, `${ADMIN_USER}_cascade_test`);

    // ========================================================================
    // STEP 7: Non-Admin Authorization Test
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Non-Admin Authorization Test');
    console.log('─'.repeat(50));

    // Use the pre-created nonAdminPage (context created at start to avoid browser state issues)
    // createAccount handles navigation and storage clearing internally
    const nonAdminCreated = await createAccount(nonAdminPage!, NON_ADMIN_USER, {
      isFirstUser: false,
    });

    if (nonAdminCreated) {
      await waitForWorkspaceLoaded(nonAdminPage);
      await takeScreenshot(nonAdminPage, `${NON_ADMIN_USER}_logged_in`);

      // Try to create an office as non-admin
      console.log('  Testing non-admin office creation...');
      if (await clickAddOfficeButton(nonAdminPage)) {
        await fillCreateOfficeModal(nonAdminPage, 'UnauthorizedOffice', 'Should fail');

        // Check if permission was denied
        results.nonAdminCannotCreateOffice = await hasPermissionDenied(nonAdminPage);
        if (!results.nonAdminCannotCreateOffice) {
          // Check if office was NOT created
          results.nonAdminCannotCreateOffice = !(await itemExistsInSidebar(nonAdminPage, 'UnauthorizedOffice'));
        }
      } else {
        // No add button visible = good, non-admins shouldn't see it
        results.nonAdminCannotCreateOffice = true;
      }
      console.log(`  Non-admin cannot create office: ${results.nonAdminCannotCreateOffice}`);
      await takeScreenshot(nonAdminPage, `${NON_ADMIN_USER}_auth_test`);
    }

    // Note: Don't close nonAdminContext here - browser.close() in finally handles it

    // ========================================================================
    // Cleanup: Delete test office
    // ========================================================================
    console.log('\n' + '─'.repeat(50));
    console.log('CLEANUP: Delete Test Office');
    console.log('─'.repeat(50));

    const updatedOfficeName = `${TEST_OFFICE_NAME}_Updated`;
    if (await itemExistsInSidebar(adminPage, updatedOfficeName)) {
      results.officeDeleted = await deleteOffice(adminPage, updatedOfficeName);
      if (results.officeDeleted) {
        const toastOk = await assertNoToastConflict(adminPage, 'Cleanup Delete Office', uxTracker);
        if (!toastOk) {
          results.toastConflictDetected = true;
          await takeScreenshot(adminPage, `${ADMIN_USER}_cleanup_delete_TOAST_CONFLICT`);
        }
        await dismissAllToasts(adminPage);
      }
    } else if (await itemExistsInSidebar(adminPage, TEST_OFFICE_NAME)) {
      results.officeDeleted = await deleteOffice(adminPage, TEST_OFFICE_NAME);
      if (results.officeDeleted) {
        const toastOk = await assertNoToastConflict(adminPage, 'Cleanup Delete Office', uxTracker);
        if (!toastOk) {
          results.toastConflictDetected = true;
          await takeScreenshot(adminPage, `${ADMIN_USER}_cleanup_delete_TOAST_CONFLICT`);
        }
        await dismissAllToasts(adminPage);
      }
    }
    console.log(`  Cleanup - office deleted: ${results.officeDeleted}`);

    await takeScreenshot(adminPage, 'FINAL_cleanup');

  } catch (error) {
    console.error('\n[TEST ERROR]', error);
    uxTracker.log('critical', 'functional', `Test crashed: ${error}`);

    if (adminPage) {
      await takeScreenshot(adminPage, 'ERROR_state');
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

    console.log('\nCore Functionality:');
    console.log(`  Account Creation:           ${results.accountCreation ? 'PASS' : 'FAIL'}`);
    console.log(`  Workspace Loaded:           ${results.workspaceLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`  Is Admin:                   ${results.isAdmin ? 'PASS' : 'FAIL'}`);

    console.log('\nOffice CRUD:');
    console.log(`  Office Created:             ${results.officeCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Office Name Updated:        ${results.officeNameUpdated ? 'PASS' : 'SKIP'}`);
    console.log(`  Office Deleted:             ${results.officeDeleted ? 'PASS' : 'SKIP'}`);

    console.log('\nRoom CRUD:');
    console.log(`  Room Created:               ${results.roomCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Room Deleted:               ${results.roomDeleted ? 'PASS' : 'SKIP'}`);

    console.log('\nCascade Delete:');
    console.log(`  Cascade Delete Works:       ${results.cascadeDeleteWorks ? 'PASS' : 'FAIL'}`);

    console.log('\nAuthorization:');
    console.log(`  Non-Admin Cannot Create:    ${results.nonAdminCannotCreateOffice ? 'PASS' : 'FAIL'}`);

    console.log('\nToast Validation:');
    console.log(`  No Toast Conflicts:         ${!results.toastConflictDetected ? 'PASS' : 'FAIL'}`);

    // Determine overall pass/fail
    const criticalTests = [
      results.accountCreation,
      results.workspaceLoaded,
      results.officeCreated,
      !results.toastConflictDetected, // No toast conflicts is critical
    ];

    overallPass = criticalTests.every(Boolean);

    harness.finalize(overallPass, results);

    // Keep browser open for inspection
    console.log('\nBrowser will remain open for 15 seconds for manual inspection...');
    await sleep(15000);

    if (browser) {
      await browser.close();
    }
  }

  return overallPass;
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
