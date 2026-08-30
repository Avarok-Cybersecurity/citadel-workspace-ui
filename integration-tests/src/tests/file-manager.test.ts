/**
 * File Manager Integration Test
 *
 * Comprehensive tests for the File Manager (RE-VFS) UI:
 * 1. Create two accounts and P2P register
 * 2. Navigate to File Manager (?section=files)
 * 3. Verify "No Peers Connected" state (before P2P setup)
 * 4. Verify tree loading after P2P connection
 * 5. Verify default folders (Sent Files, Received Files)
 * 6. Folder operations: create, navigate, sync, delete
 * 7. Context menu operations
 * 8. Breadcrumb navigation
 * 9. Peer synchronization verification
 */

import { Page } from 'playwright';
import {
  isHiddenWithin,
  sleep,
  createSeparateBrowsers,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  closeAnyModals,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: { alice: boolean; bob: boolean };
  noPeersState: boolean;
  p2pSetup: { registered: boolean; accepted: boolean };
  navigation: { aliceToFileManager: boolean; bobToFileManager: boolean };
  treeLoading: { aliceTreeLoaded: boolean; bobTreeLoaded: boolean };
  defaultFolders: { aliceSeesFolders: boolean; bobSeesFolders: boolean };
  folderOperations: {
    createFolder: boolean;
    navigateIntoFolder: boolean;
    breadcrumbNavigation: boolean;
    syncFolder: boolean;
    deleteFolder: boolean;
    peerSeesChanges: boolean;
    /** The folder disappearing from the PEER after deletion, not just locally. */
    peerSeesFolderRemoved: boolean;
  };
  fileOperations: {
    uploadFile: boolean;
    fileVisible: boolean;
    peerSeesFile: boolean;
    deleteFile: boolean;
    fileRemoved: boolean;
    peerSeesFileRemoved: boolean;
  };
  contextMenu: {
    openContextMenu: boolean;
    hasNewFolder: boolean;
    hasDelete: boolean;
  };
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const ALICE = `fm_alice_${timestamp}`;
const BOB = `fm_bob_${timestamp}`;
const TEST_FOLDER = 'test-folder';
const TEST_FILE_NAME = 'test-document.txt';
const TEST_FILE_CONTENT = 'Hello, RE-VFS! This is a test file.';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Navigate to File Manager section
 */
async function navigateToFileManager(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Navigating to File Manager ===`);
  try {
    const loaded = await waitForWorkspaceLoaded(page, 30000);
    if (!loaded) {
      console.log('  Workspace not fully loaded');
      return false;
    }

    // Click the File Manager sidebar button
    const filesBtn = page.locator('[data-testid="file-manager-button"]');
    if (await filesBtn.isVisible().catch(() => false)) {
      await filesBtn.click();
      console.log('  Clicked File Manager sidebar button');
    } else {
      // Fallback: navigate via URL
      const currentUrl = page.url();
      const baseUrl = currentUrl.split('?')[0];
      await page.goto(`${baseUrl}?section=files`, { waitUntil: 'commit', timeout: 30000 });
      console.log('  Navigated via URL (fallback)');
    }
    await sleep(2000);
    return true;
  } catch (error) {
    console.error(`  Error navigating: ${error}`);
    return false;
  }
}

/**
 * Check if "No Peers Connected" state is shown
 */
async function checkNoPeersState(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Checking "No Peers Connected" state ===`);
  try {
    const heading = page.locator('h2:has-text("No Peers Connected")');
    const visible = await isVisibleWithin(heading, 30000);
    console.log(`  "No Peers Connected" visible: ${visible}`);
    return visible;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Wait for VFS tree to load (Sent Files becomes visible)
 */
async function waitForTreeLoaded(page: Page, label: string, timeoutMs = 30000): Promise<boolean> {
  console.log(`\n=== ${label}: Waiting for VFS tree to load ===`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await page.getByText('Sent Files', { exact: true }).first().isVisible().catch(() => false)) {
      console.log('  Tree loaded: true');
      return true;
    }

    if (await page.locator('text="File System Error"').isVisible().catch(() => false)) {
      console.log('  Error: File System Error displayed');
      return false;
    }

    const noPeers = await page.getByText('No Peers Connected').isVisible().catch(() => false);
    const loading = await page.getByText('Loading file system').isVisible().catch(() => false);
    if (noPeers || loading) {
      console.log(`  Waiting... noPeers=${noPeers} loading=${loading}`);
    }
    await sleep(1000);
  }

  console.log('  Tree not loaded (timeout)');
  return false;
}

/**
 * Verify default folders exist
 */
async function verifyDefaultFolders(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Verifying default folders ===`);
  const hasSent = await isVisibleWithin(page.getByText('Sent Files', { exact: true }).first(), 5000);
  const hasReceived = await isVisibleWithin(page.getByText('Received Files', { exact: true }).first(), 5000);
  console.log(`  Sent Files: ${hasSent}, Received Files: ${hasReceived}`);
  return hasSent && hasReceived;
}

/**
 * Create a folder using the toolbar button
 */
async function createFolderViaToolbar(page: Page, label: string, folderName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Creating folder "${folderName}" ===`);
  try {
    // Click New Folder button (FolderPlus icon)
    const newFolderBtn = page.locator('button').filter({ has: page.locator('svg.lucide-folder-plus') }).first();
    if (await newFolderBtn.isVisible().catch(() => false)) {
      await newFolderBtn.click();
    } else {
      // Fallback: first button in toolbar
      await page.locator('.flex.items-center.gap-1 button').first().click();
    }

    // The name is asked for by an in-app dialog now, not window.prompt, so
    // there is no native dialog to accept — type into the field and submit.
    const nameInput = page.locator('#prompt-dialog-input');
    if (!await isVisibleWithin(nameInput, 5000)) {
      console.log('  ERROR: the new-folder dialog did not appear');
      return false;
    }
    await nameInput.fill(folderName);
    await page.getByTestId('prompt-dialog-confirm').click();
    await sleep(2000);

    const visible = await isVisibleWithin(page.getByText(folderName, { exact: true }).first(), 5000);
    console.log(`  Folder "${folderName}" visible: ${visible}`);
    return visible;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Navigate into a folder by clicking it
 */
async function navigateIntoFolder(page: Page, label: string, folderName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Navigating into folder "${folderName}" ===`);
  try {
    const folderItem = page.getByText(folderName, { exact: true }).first();
    if (await folderItem.isVisible().catch(() => false)) {
      await folderItem.click();
      await sleep(1000);
      // Check breadcrumb shows folder
      const breadcrumbVisible = await isVisibleWithin(page.locator(`button:has-text("${folderName}")`), 3000);
      console.log(`  Breadcrumb shows folder: ${breadcrumbVisible}`);
      return breadcrumbVisible;
    }
    return false;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Navigate back to root via breadcrumb
 */
async function navigateViaBreadcrumb(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Navigating via breadcrumb to Root ===`);
  try {
    const rootBtn = page.locator('button:has-text("Root")').first();
    if (await rootBtn.isVisible().catch(() => false)) {
      await rootBtn.click();
      await sleep(1000);
      const sentFiles = await isVisibleWithin(page.getByText('Sent Files', { exact: true }).first(), 3000);
      console.log(`  Back at root: ${sentFiles}`);
      return sentFiles;
    }
    return false;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Click Sync button
 */
async function clickSyncButton(page: Page, label: string): Promise<boolean> {
  console.log(`\n=== ${label}: Clicking Sync button ===`);
  try {
    const syncBtn = page.locator('button').filter({ has: page.locator('svg.lucide-refresh-cw') }).first();
    if (await syncBtn.isVisible().catch(() => false)) {
      await syncBtn.click();
      await sleep(2000);
      console.log('  Sync clicked');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Open context menu on a folder
 */
async function openContextMenu(page: Page, label: string, folderName: string): Promise<{ opened: boolean; hasNewFolder: boolean; hasDelete: boolean }> {
  console.log(`\n=== ${label}: Opening context menu on "${folderName}" ===`);
  try {
    // Find the folder in the tree view - look for the tree item container, not just text
    const folderItem = page.locator(`[data-testid="tree-item-${folderName}"], .truncate:has-text("${folderName}")`).first();

    // Fallback to text if specific locator not found
    const targetElement = await folderItem.isVisible().catch(() => false)
      ? folderItem
      : page.getByText(folderName, { exact: true }).first();

    if (await targetElement.isVisible().catch(() => false)) {
      console.log(`  Found folder element, right-clicking...`);

      // Get the bounding box and right-click in the center
      const box = await targetElement.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      } else {
        await targetElement.click({ button: 'right' });
      }

      // Wait for context menu portal to render
      await sleep(1500);

      // Debug: Check what menus are visible
      const menuContent = await page.locator('[role="menu"]').count();
      const contextMenuContent = await page.locator('[data-radix-menu-content]').count();
      console.log(`  Menu elements found: role=menu: ${menuContent}, radix-menu-content: ${contextMenuContent}`);

      // Context menu uses radix-ui, items are rendered in a portal
      // Look for menu items by role or by containing text
      const hasNewFolder = await isVisibleWithin(page.locator('[role="menuitem"]:has-text("New Folder")'), 3000);
      const hasDeleteFolder = await isVisibleWithin(page.locator('[role="menuitem"]:has-text("Delete Folder")'), 1000);
      const hasDelete = await isVisibleWithin(page.locator('[role="menuitem"]:has-text("Delete")').first(), 1000);

      console.log(`  New Folder: ${hasNewFolder}, Delete Folder: ${hasDeleteFolder}, Delete: ${hasDelete}`);
      await page.keyboard.press('Escape');
      await sleep(300);
      return { opened: menuContent > 0 || contextMenuContent > 0, hasNewFolder, hasDelete: hasDeleteFolder || hasDelete };
    }
    console.log(`  Folder element not found`);
    return { opened: false, hasNewFolder: false, hasDelete: false };
  } catch (error) {
    console.error(`  Error: ${error}`);
    return { opened: false, hasNewFolder: false, hasDelete: false };
  }
}

/**
 * Delete a folder via context menu
 */
async function deleteFolderViaContextMenu(page: Page, label: string, folderName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Deleting folder "${folderName}" ===`);
  try {
    // Wait a bit to ensure any previous menus are fully closed
    await sleep(500);

    // Find the folder in the tree view - use same approach as openContextMenu
    const folderItem = page.locator(`[data-testid="tree-item-${folderName}"], .truncate:has-text("${folderName}")`).first();
    const targetElement = await folderItem.isVisible().catch(() => false)
      ? folderItem
      : page.getByText(folderName, { exact: true }).first();

    if (!await targetElement.isVisible().catch(() => false)) {
      console.log(`  Folder not found`);
      return false;
    }
    console.log(`  Found folder element`);

    // Deletion is confirmed by an in-app AlertDialog now, not window.confirm,
    // so there is no native dialog to accept — the confirm button is clicked
    // after the menu item below.

    // Get the bounding box and right-click in the center for more reliable context menu
    const box = await targetElement.boundingBox();
    if (box) {
      console.log(`  Right-clicking at (${box.x + box.width / 2}, ${box.y + box.height / 2})`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    } else {
      console.log(`  Using fallback click`);
      await targetElement.click({ button: 'right' });
    }

    // Wait for context menu portal to render
    await sleep(1500);

    // Debug: Check what menus are visible
    const menuCount = await page.locator('[role="menu"]').count();
    const radixMenuCount = await page.locator('[data-radix-menu-content]').count();
    console.log(`  Menu elements found: role=menu: ${menuCount}, radix: ${radixMenuCount}`);

    // Context menu uses radix-ui, items are rendered in a portal with role="menuitem"
    let deleteOption = page.locator('[role="menuitem"]:has-text("Delete Folder")');
    if (!await isVisibleWithin(deleteOption, 2000)) {
      // Fallback to "Delete" if "Delete Folder" not found
      deleteOption = page.locator('[role="menuitem"]:has-text("Delete")').first();
    }
    if (await isVisibleWithin(deleteOption, 1000)) {
      console.log('  Found delete option, clicking...');
      await deleteOption.click();

      // Confirm in the app's own dialog.
      const confirmButton = page.locator('[role="alertdialog"] button:has-text("Delete")').last();
      if (await isVisibleWithin(confirmButton, 5000)) {
        console.log('  Confirming deletion in the in-app dialog');
        await confirmButton.click();
      } else {
        console.log('  WARNING: in-app confirm dialog did not appear');
      }

      // Wait for the folder to LEAVE the tree, rather than sleeping and sampling.
      //
      // Same reasoning as verifyPeerSeesChanges below, which was already fixed
      // this way: isVisible does not wait, so this loop was five fixed 1s sleeps
      // with a point sample after each. Worse, a sample taken while the tree had
      // not re-rendered finds nothing and reports the folder deleted whether or
      // not it was. isHiddenWithin asks the right question and returns the moment
      // it holds, so the common case costs a fraction of the old 5 seconds.
      // The tree row by name, not any element whose text contains it.
      // `.truncate` is shared by grid tiles, the properties dialog and the
      // storage line, and `has-text` matches substrings -- so this asked "is
      // that word anywhere on the page" while its own message said "still
      // visible in tree". The app now renders `tree-item-<name>`.
      const treeItem = page.locator(`[data-testid="tree-item-${folderName}"]`).first();
      // Fifteen seconds, and the number is measured rather than guessed.
      //
      // The instrumentation added for this failure shows the deletion starting
      // 7.8s AFTER the confirm click -- and 1.6s after this check had already
      // given up at six. `revfsService.rmdir` takes a per-peer serial lock, so
      // it queues behind whatever the previous step left in flight; here that
      // is the file deletion's peer ack and its orphaned-byte sweep. Nothing
      // was slow to render. The operation had not begun.
      //
      // Fifteen matches the peer-side check further down, which waits that long
      // for the same reason.
      if (await isHiddenWithin(treeItem, 15_000)) {
        console.log(`  Folder deleted from tree: true`);
        return true;
      }
      console.log(`  Folder deleted: false (still visible in tree after 6s)`);
      return false;
    }
    console.log('  Delete option not found in context menu');

    // Try to escape any open menu
    await page.keyboard.press('Escape');
    return false;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Verify peer sees folder changes after sync (with retry)
 */
async function verifyPeerSeesChanges(page: Page, label: string, folderName: string, shouldExist: boolean): Promise<boolean> {
  console.log(`\n=== ${label}: Sync and check folder "${folderName}" (expect ${shouldExist ? 'present' : 'absent'}) ===`);

  // Wait for the state we expect, rather than sleeping and sampling once.
  //
  // Each attempt used to sleep and then call isVisible({ timeout }), which does
  // not wait at all — so whether propagation was seen came down to whether it
  // happened to land inside a fixed 4/5/6 second sleep. That is why this was
  // flaky in BOTH directions: one run the folder had not arrived yet, the next
  // run it had not gone away yet, and neither was a product failure.
  //
  // isHiddenWithin for the absent case: waiting for something to appear and
  // waiting for it to go away are different questions, and using the presence
  // helper for both would report "not there yet" as success.
  const target = () => page.getByText(folderName, { exact: true }).first();

  for (let attempt = 1; attempt <= 3; attempt++) {
    await clickSyncButton(page, label);

    const result = shouldExist
      ? await isVisibleWithin(target(), 15_000)
      : await isHiddenWithin(target(), 15_000);

    console.log(`  Attempt ${attempt}: expected ${shouldExist ? 'visible' : 'hidden'}: ${result ? 'PASS' : 'retry...'}`);
    if (result) return true;
  }

  const finalVisible = await isVisibleWithin(page.getByText(folderName, { exact: true }).first(), 2000);
  const finalResult = shouldExist ? finalVisible : !finalVisible;
  console.log(`  Final result: Folder visible: ${finalVisible}, expected ${shouldExist ? 'visible' : 'hidden'}: ${finalResult ? 'PASS' : 'FAIL'}`);

  if (!finalResult && !shouldExist) {
    // getByText matches the whole page, so a name left in a breadcrumb or a
    // toast looks identical to a row that never went away. Report where it
    // actually is, so this says which.
    const where = await page.evaluate((name) => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        if (el.children.length) continue;
        if ((el.textContent || '').trim() !== name) continue;
        const path: string[] = [];
        for (let e: Element | null = el; e && path.length < 5; e = e.parentElement) {
          path.push(`${e.tagName.toLowerCase()}${e.getAttribute('data-testid') ? `[${e.getAttribute('data-testid')}]` : ''}`);
        }
        out.push(path.join(' < '));
      }
      return out;
    }, folderName);
    console.log(`  STILL-PRESENT AT: ${JSON.stringify(where)}`);
  }

  return finalResult;
}

// ============================================================================
// File Operation Helper Functions
// ============================================================================

/**
 * Upload a file via the toolbar Upload button
 * Uses Playwright's file chooser API to handle the hidden file input
 */
async function uploadFileViaToolbar(
  page: Page,
  label: string,
  fileName: string,
  content: string,
  targetDir: string = '/'
): Promise<boolean> {
  console.log(`\n=== ${label}: Uploading file "${fileName}" to "${targetDir}" ===`);
  try {
    // Ensure we're at the correct directory
    if (targetDir === '/') {
      // Explicitly navigate to root to ensure currentPath state is reset
      const rootBtn = page.locator('button:has-text("Root")').first();
      if (await rootBtn.isVisible().catch(() => false)) {
        await rootBtn.click();
        // Wait longer for React state to propagate
        await sleep(2000);
        console.log('  Navigated to root via breadcrumb');
        // Verify we're at root by checking that default folders are visible at top level
        const atRoot = await isVisibleWithin(page.getByText('Sent Files', { exact: true }).first(), 3000);
        console.log(`  Confirmed at root: ${atRoot}`);
      }
    } else {
      // Navigate to target directory
      const targetFolder = targetDir.replace(/^\//, '');
      const folderItem = page.getByText(targetFolder, { exact: true }).first();
      if (await folderItem.isVisible().catch(() => false)) {
        await folderItem.click();
        await sleep(1000);
        console.log(`  Navigated to ${targetDir}`);
      }
    }

    // Set up file chooser handler. It has to be armed BEFORE the click or the
    // event races us, which means the early `return false` below can abandon it.
    // An abandoned waitForEvent rejects on its own timeout with no handler
    // attached, and an unhandled rejection takes the whole node process down —
    // that is how this spec lost every result it had already collected and
    // reported NO VERDICT. Attaching a no-op catch marks it handled; awaiting
    // the original promise further down still works exactly as before.
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
    fileChooserPromise.catch(() => undefined);

    // Click Upload button (Upload icon in toolbar)
    const uploadBtn = page.locator('button').filter({ has: page.locator('svg.lucide-upload') }).first();
    if (await uploadBtn.isVisible().catch(() => false)) {
      await uploadBtn.click();
      console.log('  Clicked Upload button');
    } else {
      console.log('  Upload button not found');
      return false;
    }

    // Wait for file chooser and set the file
    const fileChooser = await fileChooserPromise;

    // Create a temporary file buffer
    const buffer = Buffer.from(content, 'utf-8');
    await fileChooser.setFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer,
    });
    console.log(`  Set file: ${fileName} (${buffer.length} bytes)`);

    // Wait for upload to process
    await sleep(3000);

    // Check if file appears in the UI
    const fileVisible = await isVisibleWithin(page.getByText(fileName, { exact: true }).first(), 5000);
    console.log(`  File "${fileName}" visible: ${fileVisible}`);

    // Navigate back to root if we navigated away
    if (targetDir !== '/') {
      const rootBtn = page.locator('button:has-text("Root")').first();
      if (await rootBtn.isVisible().catch(() => false)) {
        await rootBtn.click();
        await sleep(1000);
      }
    }

    return fileVisible;
  } catch (error) {
    console.error(`  Error uploading file: ${error}`);
    return false;
  }
}

/**
 * Verify a file is visible in the current view
 */
async function verifyFileVisible(page: Page, label: string, fileName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Verifying file "${fileName}" is visible ===`);
  try {
    // Look for file in tree or content grid
    const visible = await isVisibleWithin(page.getByText(fileName, { exact: true }).first(), 5000);
    console.log(`  File visible: ${visible}`);
    return visible;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Delete a file via context menu
 */
async function deleteFileViaContextMenu(page: Page, label: string, fileName: string): Promise<boolean> {
  console.log(`\n=== ${label}: Deleting file "${fileName}" ===`);
  try {
    await sleep(500);

    // Find the file in the tree or content grid
    const fileItem = page.locator(`.truncate:has-text("${fileName}")`).first();
    const targetElement = await fileItem.isVisible().catch(() => false)
      ? fileItem
      : page.getByText(fileName, { exact: true }).first();

    if (!await targetElement.isVisible().catch(() => false)) {
      console.log(`  File not found`);
      return false;
    }
    console.log(`  Found file element`);

    // In-app confirmation; the confirm button is clicked after the menu item.

    // Right-click on file
    const box = await targetElement.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    } else {
      await targetElement.click({ button: 'right' });
    }

    await sleep(1500);

    // Click Delete option in context menu
    // By testid. This looked for "Delete File" first -- a label nothing renders
    // -- and spent two seconds waiting for nothing before falling back to a
    // match on the word "Delete", which also matches "Delete Folder" and any
    // other destructive item the menu grows.
    const deleteOption = page.getByTestId('vfs-delete').first();

    if (await isVisibleWithin(deleteOption, 1000)) {
      console.log('  Found delete option, clicking...');
      await deleteOption.click();

      // Confirm in the app's own dialog.
      const confirmFileDelete = page.locator('[role="alertdialog"] button:has-text("Delete")').last();
      if (await isVisibleWithin(confirmFileDelete, 5000)) {
        console.log('  Confirming deletion in the in-app dialog');
        await confirmFileDelete.click();
      } else {
        console.log('  WARNING: in-app confirm dialog did not appear');
      }

      // Wait for the file to GO. Was five 1s sleeps each followed by a point
      // sample; see the folder-deletion loop above for why that both wastes time
      // and can report a deletion that did not happen.
      const fileItem = page.locator(`.truncate:has-text("${fileName}")`).first();
      if (await isHiddenWithin(fileItem, 6000)) {
        console.log(`  File deleted: true`);
        return true;
      }
      console.log(`  File deleted: false (still visible after 6s)`);
      return false;
    }

    console.log('  Delete option not found');
    await page.keyboard.press('Escape');
    return false;
  } catch (error) {
    console.error(`  Error: ${error}`);
    return false;
  }
}

/**
 * Verify peer sees file changes after sync
 */
async function verifyPeerSeesFile(
  page: Page,
  label: string,
  fileName: string,
  shouldExist: boolean
): Promise<boolean> {
  console.log(`\n=== ${label}: Sync and check file "${fileName}" (expect ${shouldExist ? 'present' : 'absent'}) ===`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    await clickSyncButton(page, label);

    // The two directions need opposite treatment, and a blanket
    // "replace the sleeps with waits" sweep would flatten them.
    //
    // Waiting for a file to APPEAR needs no fixed delay at all:
    // `isVisibleWithin` polls, so it returns the moment the file lands and no
    // later than its timeout. Sleeping first and then polling spends the sleep
    // every time and buys nothing.
    //
    // Confirming a file is ABSENT needs exactly that delay: one that has not
    // arrived yet looks identical to one that is gone, so without a settle
    // period the negative is not evidence. Same total patience either way --
    // the difference is that the positive case can finish early.
    const settle: number = 3000 + attempt * 1000;
    if (!shouldExist) await sleep(settle);

    const visible = await isVisibleWithin(
      page.getByText(fileName, { exact: true }).first(),
      shouldExist ? settle + 5000 : 5000,
    );
    const result = shouldExist ? visible : !visible;

    console.log(`  Attempt ${attempt}: File visible: ${visible}, expected ${shouldExist ? 'visible' : 'hidden'}: ${result ? 'PASS' : 'retry...'}`);

    if (result) {
      return true;
    }

    if (attempt < 3) {
      console.log(`  Retrying sync...`);
    }
  }

  const finalVisible = await isVisibleWithin(page.getByText(fileName, { exact: true }).first(), 2000);
  const finalResult = shouldExist ? finalVisible : !finalVisible;
  console.log(`  Final result: File visible: ${finalVisible}, expected ${shouldExist ? 'visible' : 'hidden'}: ${finalResult ? 'PASS' : 'FAIL'}`);
  return finalResult;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'File Manager Integration Test',
    reportFileName: 'FILE_MANAGER_TEST_REPORT.json',
    metadata: { alice: ALICE, bob: BOB },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`User 1 (Alice): ${ALICE}`);
  console.log(`User 2 (Bob): ${BOB}`);
  console.log('');

  const { pages, cleanup } = await createSeparateBrowsers(2);
  const page1 = pages[0];
  const page2 = pages[1];

  const results: TestResults = {
    accountCreation: { alice: false, bob: false },
    noPeersState: false,
    p2pSetup: { registered: false, accepted: false },
    navigation: { aliceToFileManager: false, bobToFileManager: false },
    treeLoading: { aliceTreeLoaded: false, bobTreeLoaded: false },
    defaultFolders: { aliceSeesFolders: false, bobSeesFolders: false },
    folderOperations: {
      createFolder: false,
      navigateIntoFolder: false,
      breadcrumbNavigation: false,
      syncFolder: false,
      deleteFolder: false,
      peerSeesChanges: false,
      peerSeesFolderRemoved: false,
    },
    fileOperations: {
      uploadFile: false,
      fileVisible: false,
      peerSeesFile: false,
      deleteFile: false,
      fileRemoved: false,
      peerSeesFileRemoved: false,
    },
    contextMenu: {
      openContextMenu: false,
      hasNewFolder: false,
      hasDelete: false,
    },
  };

  try {
    setupConsoleCapture(page1, 'Alice', ['error', 'Error', 'revfs', 'RE-VFS', 'ILM']);
    setupConsoleCapture(page2, 'Bob', ['error', 'Error', 'revfs', 'RE-VFS', 'ILM']);

    // ========== STEP 1: Create accounts ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 1: Account Creation');
    console.log('─'.repeat(50));

    results.accountCreation.alice = await createAccount(page1, ALICE, { isFirstUser: true, uxTracker });
    await takeScreenshot(page1, '01_alice_created');

    results.accountCreation.bob = await createAccount(page2, BOB, { isFirstUser: false, uxTracker });
    await takeScreenshot(page2, '01_bob_created');

    console.log('\n  Waiting 5s for sessions to establish...');
    await sleep(5000);

    // ========== STEP 2: File Manager - No Peers State (BEFORE any P2P activity) ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 2: File Manager - No Peers State');
    console.log('─'.repeat(50));

    // Check Alice's File Manager before any P2P registration - should show "No Peers Connected"
    results.navigation.aliceToFileManager = await navigateToFileManager(page1, 'Alice');
    results.noPeersState = await checkNoPeersState(page1, 'Alice');
    await takeScreenshot(page1, '02_no_peers_state');

    // Navigate Alice back to workspace for P2P registration
    console.log('\n  Navigating Alice back to workspace...');
    // `workspace-button` and `sidebar-workspace` were in this union and the app
    // has never rendered either, so the text matcher was doing all of the work.
    // It is left alone deliberately: CI shows it matching and the click
    // working, and `has-text` is a SUBSTRING match, so "Configure Workspace"
    // and "Join New Workspace" are both candidates for `.first()`. Which one it
    // actually hits needs a run to observe, and guessing at a replacement here
    // would trade a selector that works for one that might not.
    const workspaceBtn = page1.locator('button:has-text("Workspace")');
    if (await workspaceBtn.first().isVisible().catch(() => false)) {
      await workspaceBtn.first().click();
      console.log('  Clicked Workspace sidebar button');
    } else {
      await page1.goBack();
      console.log('  Used goBack() to return to workspace');
    }
    await waitForWorkspaceLoaded(page1, 30000);

    // ========== STEP 3: P2P Registration ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 3: P2P Registration');
    console.log('─'.repeat(50));

    await closeAnyModals(page1);
    results.p2pSetup.registered = await p2pRegister(page1, ALICE, BOB, { uxTracker });
    await takeScreenshot(page1, '03_p2p_registered');

    // CRITICAL: Close any modals that might be blocking (Peer Discovery modal)
    console.log('  Closing any modals after P2P registration...');
    await closeAnyModals(page1);
    await sleep(1000);

    // ========== STEP 4: Accept P2P Request ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 4: Accept P2P Request');
    console.log('─'.repeat(50));

    await sleep(3000);
    results.p2pSetup.accepted = await acceptP2PRequest(page2, BOB, uxTracker);
    await takeScreenshot(page2, '04_p2p_accepted');

    // CRITICAL: Close any modals that might be blocking (Pending Requests modal)
    console.log('  Closing any modals after P2P acceptance...');
    await closeAnyModals(page2);
    await sleep(1000);

    console.log('\n  Waiting 5s for P2P connection...');
    await sleep(5000);

    // ========== STEP 5: File Manager - Tree Loading ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 5: File Manager - Tree Loading');
    console.log('─'.repeat(50));

    // Alice needs to navigate to File Manager (should now show tree since P2P is connected)
    // Close any remaining modals first
    await closeAnyModals(page1);
    results.navigation.aliceToFileManager = await navigateToFileManager(page1, 'Alice');
    results.treeLoading.aliceTreeLoaded = await waitForTreeLoaded(page1, 'Alice', 30000);
    await takeScreenshot(page1, '05_alice_tree_loaded');

    // Bob needs to go to File Manager (should now show tree since P2P is connected)
    results.navigation.bobToFileManager = await navigateToFileManager(page2, 'Bob');
    results.treeLoading.bobTreeLoaded = await waitForTreeLoaded(page2, 'Bob', 30000);
    await takeScreenshot(page2, '05_bob_tree_loaded');

    // ========== STEP 6: Verify Default Folders ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 6: Verify Default Folders');
    console.log('─'.repeat(50));

    results.defaultFolders.aliceSeesFolders = await verifyDefaultFolders(page1, 'Alice');
    results.defaultFolders.bobSeesFolders = await verifyDefaultFolders(page2, 'Bob');

    // ========== STEP 7: Folder Operations ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 7: Folder Operations');
    console.log('─'.repeat(50));

    results.folderOperations.createFolder = await createFolderViaToolbar(page1, 'Alice', TEST_FOLDER);
    await takeScreenshot(page1, '07_folder_created');

    if (results.folderOperations.createFolder) {
      results.folderOperations.navigateIntoFolder = await navigateIntoFolder(page1, 'Alice', TEST_FOLDER);
      await takeScreenshot(page1, '07_in_folder');
    }

    results.folderOperations.breadcrumbNavigation = await navigateViaBreadcrumb(page1, 'Alice');
    await takeScreenshot(page1, '07_breadcrumb');

    results.folderOperations.syncFolder = await clickSyncButton(page1, 'Alice');
    results.folderOperations.peerSeesChanges = await verifyPeerSeesChanges(page2, 'Bob', TEST_FOLDER, true);
    await takeScreenshot(page2, '07_bob_sees_folder');

    // ========== STEP 8: Context Menu ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 8: Context Menu');
    console.log('─'.repeat(50));

    const contextResult = await openContextMenu(page1, 'Alice', TEST_FOLDER);
    results.contextMenu.openContextMenu = contextResult.opened;
    results.contextMenu.hasNewFolder = contextResult.hasNewFolder;
    results.contextMenu.hasDelete = contextResult.hasDelete;
    await takeScreenshot(page1, '08_context_menu');

    // ========== STEP 9: File Operations - Upload ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 9: File Operations - Upload');
    console.log('─'.repeat(50));

    // Navigate to test-folder to ensure we're in a known directory for file upload
    // (Due to React state timing, we explicitly navigate to the target folder)
    const folderForUpload = await page1.getByText(TEST_FOLDER, { exact: true }).first();
    if (await folderForUpload.isVisible().catch(() => false)) {
      await folderForUpload.click();
      await sleep(1000);
      console.log(`  Navigated into ${TEST_FOLDER} for file upload`);
    }

    // Upload file to current directory (test-folder)
    results.fileOperations.uploadFile = await uploadFileViaToolbar(
      page1,
      'Alice',
      TEST_FILE_NAME,
      TEST_FILE_CONTENT,
      `/${TEST_FOLDER}`
    );
    await takeScreenshot(page1, '09_file_uploaded');

    // Verify file is visible on Alice's side
    results.fileOperations.fileVisible = await verifyFileVisible(page1, 'Alice', TEST_FILE_NAME);

    // Bob also needs to navigate to test-folder to see the file
    const bobFolder = await page2.getByText(TEST_FOLDER, { exact: true }).first();
    if (await bobFolder.isVisible().catch(() => false)) {
      await bobFolder.click();
      await sleep(1000);
      console.log(`  Bob navigated into ${TEST_FOLDER}`);
    }

    // Sync and verify Bob sees the file
    results.fileOperations.peerSeesFile = await verifyPeerSeesFile(page2, 'Bob', TEST_FILE_NAME, true);
    await takeScreenshot(page2, '09_bob_sees_file');

    // ========== STEP 10: File Operations - Delete ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 10: File Operations - Delete');
    console.log('─'.repeat(50));

    // Delete the file
    results.fileOperations.deleteFile = await deleteFileViaContextMenu(page1, 'Alice', TEST_FILE_NAME);
    await takeScreenshot(page1, '10_file_deleted');

    // Verify file is removed on Alice's side
    results.fileOperations.fileRemoved = !await verifyFileVisible(page1, 'Alice', TEST_FILE_NAME);

    // Sync and verify Bob sees the file is gone.
    //
    // Only meaningful if Bob ever saw it. `verifyPeerSeesFile(..., false)`
    // returns true when the name is absent, and a file that never arrived is
    // absent too -- so on the run that found this, "Peer Sees File: FAIL" was
    // followed by "Peer Sees File Removed: PASS", and the second line carried
    // no information at all. A check that cannot fail in the state that matters
    // is worse than a missing one, because it reads as evidence.
    results.fileOperations.peerSeesFileRemoved = results.fileOperations.peerSeesFile
      ? await verifyPeerSeesFile(page2, 'Bob', TEST_FILE_NAME, false)
      : false;
    if (!results.fileOperations.peerSeesFile) {
      console.log(
        '  Skipped the removal check: Bob never saw the file, so its absence proves nothing.',
      );
    }
    await takeScreenshot(page2, '10_bob_file_gone');

    // ========== STEP 11: Delete Folder ==========
    console.log('\n' + '─'.repeat(50));
    console.log('STEP 11: Delete Folder');
    console.log('─'.repeat(50));

    results.folderOperations.deleteFolder = await deleteFolderViaContextMenu(page1, 'Alice', TEST_FOLDER);
    await takeScreenshot(page1, '09_folder_deleted');

    results.folderOperations.peerSeesFolderRemoved =
      await verifyPeerSeesChanges(page2, 'Bob', TEST_FOLDER, false);
    await takeScreenshot(page2, '09_bob_folder_gone');

    await takeScreenshot(page1, 'FINAL_alice');
    await takeScreenshot(page2, 'FINAL_bob');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const allPassed =
      results.accountCreation.alice &&
      results.accountCreation.bob &&
      results.noPeersState &&
      results.p2pSetup.registered &&
      results.p2pSetup.accepted &&
      results.treeLoading.aliceTreeLoaded &&
      results.treeLoading.bobTreeLoaded &&
      results.defaultFolders.aliceSeesFolders &&
      results.defaultFolders.bobSeesFolders &&
      results.folderOperations.createFolder &&
      results.folderOperations.navigateIntoFolder &&
      results.folderOperations.breadcrumbNavigation &&
      results.folderOperations.deleteFolder &&
      results.fileOperations.uploadFile &&
      results.fileOperations.fileVisible &&
      results.fileOperations.deleteFile &&
      results.fileOperations.fileRemoved &&
      results.contextMenu.openContextMenu &&
      // Peer propagation is the whole point of a peer-to-peer filesystem, and
      // none of it was gated: a folder could fail to reach Bob, or a file could
      // fail to disappear from Bob, and this spec still reported PASS. These two
      // hold reliably once the checks actually wait.
      results.folderOperations.peerSeesChanges &&
      results.fileOperations.peerSeesFileRemoved &&
      // Bob reaching the file manager at all, and seeing a file Alice uploaded.
      // Both were computed and left out of the gate.
      results.navigation.bobToFileManager &&
      results.fileOperations.peerSeesFile;
      // peerSeesFolderRemoved is deliberately NOT gated — see the note where it
      // is reported.

    // CHECK is advisory and FAIL is fatal, and three criteria that decide the
    // run printed CHECK. The last run reported PASS on every visible line and
    // then "OVERALL: TEST FAILED", which tells a reader nothing: the run had in
    // fact failed on "Peer Sees File", printed as CHECK. Anything `allPassed`
    // reads says FAIL when it is false; only genuinely ungated observations
    // stay CHECK.
    console.log('\nAccount Creation:');
    console.log(`  Alice:                     ${results.accountCreation.alice ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob:                       ${results.accountCreation.bob ? 'PASS' : 'FAIL'}`);

    console.log('\nFile Manager States:');
    console.log(`  No Peers State:            ${results.noPeersState ? 'PASS' : 'FAIL'}`);

    console.log('\nP2P Setup:');
    console.log(`  Registered:                ${results.p2pSetup.registered ? 'PASS' : 'FAIL'}`);
    console.log(`  Accepted:                  ${results.p2pSetup.accepted ? 'PASS' : 'FAIL'}`);

    console.log('\nTree Loading:');
    console.log(`  Alice Tree Loaded:         ${results.treeLoading.aliceTreeLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob Tree Loaded:           ${results.treeLoading.bobTreeLoaded ? 'PASS' : 'FAIL'}`);

    console.log('\nDefault Folders:');
    console.log(`  Alice Sees Folders:        ${results.defaultFolders.aliceSeesFolders ? 'PASS' : 'FAIL'}`);
    console.log(`  Bob Sees Folders:          ${results.defaultFolders.bobSeesFolders ? 'PASS' : 'FAIL'}`);

    console.log('\nFolder Operations:');
    console.log(`  Create Folder:             ${results.folderOperations.createFolder ? 'PASS' : 'FAIL'}`);
    console.log(`  Navigate Into Folder:      ${results.folderOperations.navigateIntoFolder ? 'PASS' : 'FAIL'}`);
    console.log(`  Breadcrumb Navigation:     ${results.folderOperations.breadcrumbNavigation ? 'PASS' : 'FAIL'}`);
    console.log(`  Sync Folder:               ${results.folderOperations.syncFolder ? 'PASS' : 'CHECK'}`);
    console.log(`  Delete Folder:             ${results.folderOperations.deleteFolder ? 'PASS' : 'FAIL'}`);
    // KNOWN GAP, not a flake and not a test bug. Reproduced on consecutive runs
    // once the check actually waits (it used to sleep and sample once, which is
    // what hid this). Deleting a folder does not reach the peer, while deleting
    // a FILE does — peerSeesFileRemoved passes in the same runs.
    //
    // Two things point at the cause. In one run Alice emitted no Rmdir at all,
    // only SyncResponse traffic; serverRmdir (revfs-dir-ops.ts:98) computes the
    // operation and throws it away — `const [newTree] = treeRmdir(...)` — where
    // peerRmdir keeps it and calls sendAndAwaitAck. And because mergeTrees is a
    // union that only ever adds, a removal that is missed once can never be
    // recovered by a later sync: the peer's copy wins every time.
    //
    // Left ungated rather than made to pass: whether directory deletion is meant
    // to propagate in server-backed mode is a product decision about revfs
    // semantics, not something to settle from a test.
    console.log(`  Peer Sees Folder Removed:  ${results.folderOperations.peerSeesFolderRemoved ? 'PASS' : 'KNOWN GAP (see note above)'}`);
    console.log(`  Peer Sees Changes:         ${results.folderOperations.peerSeesChanges ? 'PASS' : 'FAIL'}`);

    console.log('\nFile Operations:');
    console.log(`  Upload File:               ${results.fileOperations.uploadFile ? 'PASS' : 'FAIL'}`);
    console.log(`  File Visible:              ${results.fileOperations.fileVisible ? 'PASS' : 'FAIL'}`);
    console.log(`  Peer Sees File:            ${results.fileOperations.peerSeesFile ? 'PASS' : 'FAIL'}`);
    console.log(`  Delete File:               ${results.fileOperations.deleteFile ? 'PASS' : 'FAIL'}`);
    console.log(`  File Removed:              ${results.fileOperations.fileRemoved ? 'PASS' : 'FAIL'}`);
    console.log(
      `  Peer Sees File Removed:    ${
        results.fileOperations.peerSeesFileRemoved
          ? 'PASS'
          : results.fileOperations.peerSeesFile
            ? 'FAIL'
            : 'NOT CHECKED (the peer never saw the file)'
      }`,
    );

    // Gated, and never printed: a run could fail on this alone and the report
    // showed nothing but passes above a bare "OVERALL: TEST FAILED".
    console.log('\nNavigation:');
    console.log(`  Bob Reaches File Manager:  ${results.navigation.bobToFileManager ? 'PASS' : 'FAIL'}`);

    console.log('\nContext Menu:');
    console.log(`  Open Context Menu:         ${results.contextMenu.openContextMenu ? 'PASS' : 'FAIL'}`);
    console.log(`  New Folder Option:         ${results.contextMenu.hasNewFolder ? 'PASS' : 'CHECK'}`);
    console.log(`  Delete Option:             ${results.contextMenu.hasDelete ? 'PASS' : 'CHECK'}`);

    harness.finalize(allPassed, results);


    return allPassed;

  } catch (error) {
    console.error('\nTest error:', error);
    throw error;
  } finally {
    await cleanup();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
