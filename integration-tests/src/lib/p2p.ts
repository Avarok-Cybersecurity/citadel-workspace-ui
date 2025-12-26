/**
 * P2P operations - peer registration, connection, and conversation management
 */

import type { Page } from 'playwright';
import { sleep } from './utils.js';
import { closeAnyModals, waitForWorkspaceLoaded } from './modals.js';
import { takeScreenshot } from './screenshots.js';
import { UxIssueTracker } from './ux-tracker.js';

/**
 * Register a P2P connection with a peer
 */
export async function p2pRegister(
  page: Page,
  myUsername: string,
  peerUsername: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== P2P Register: ${myUsername} -> ${peerUsername} ===`);

  const loaded = await waitForWorkspaceLoaded(page, 45000);
  if (!loaded) {
    if (uxTracker) {
      uxTracker.log('critical', 'functional', 'Workspace failed to load for P2P registration');
    }
    await takeScreenshot(page, `${myUsername}_workspace_not_loaded`);
    return false;
  }

  // Wait longer for session to be fully established in Citadel SDK
  console.log('  Waiting for session to be fully established...');
  await sleep(5000);

  // Try to open Peer Discovery modal
  let modalOpened = false;

  // Method 1: Click the UserPlus button directly
  const userPlusBtn = page.locator('button:has(svg.lucide-user-plus), button[title="Discover Peers"]').first();
  if (await userPlusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Found Discover Peers button, clicking...');
    await userPlusBtn.click();
    await sleep(2000);
    modalOpened = true;
  }

  // Method 2: Hover over WORKSPACE MEMBERS section first
  if (!modalOpened) {
    const membersSection = page.locator('text="WORKSPACE MEMBERS"').first();
    if (await membersSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Hovering over WORKSPACE MEMBERS...');
      await membersSection.hover();
      await sleep(1000);

      const discoverBtn = page.locator('button[title="Discover Peers"], button:has(svg.lucide-user-plus)').first();
      if (await discoverBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await discoverBtn.click();
        await sleep(2000);
        modalOpened = true;
      }
    }
  }

  // Method 3: Force click
  if (!modalOpened) {
    console.log('  Attempting force click on Discover Peers...');
    await page.locator('button[title="Discover Peers"]').click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(2000);
  }

  await takeScreenshot(page, `${myUsername}_peer_discovery`);

  // Wait for peer list modal
  const modalTitle = page.locator('text="Peer Discovery"');
  if (!await modalTitle.isVisible({ timeout: 8000 }).catch(() => false)) {
    const altModal = page.locator('[role="dialog"]:has-text("Peer"), [role="dialog"]:has-text("Discovery")');
    if (!await altModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (uxTracker) {
        uxTracker.log('critical', 'functional', 'Peer Discovery modal did not open');
      }
      await takeScreenshot(page, `${myUsername}_modal_not_opened`);
      return false;
    }
  }

  console.log('  Peer Discovery modal opened');

  // Retry mechanism for peer discovery (API can timeout initially)
  const MAX_RETRIES = 3;
  let peerFound = false;

  for (let retry = 0; retry < MAX_RETRIES && !peerFound; retry++) {
    if (retry > 0) {
      console.log(`  Retry ${retry}/${MAX_RETRIES - 1}: Refreshing peer list...`);
      const refreshBtn = page.locator('[role="dialog"] button:has(svg.lucide-refresh-cw)');
      if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await refreshBtn.click();
        await sleep(1000);
      }
    }

    // Wait for loading to complete
    console.log('  Waiting for peer list to load...');
    for (let i = 0; i < 15; i++) {
      const loadingSpinner = page.locator('[role="dialog"] svg.lucide-loader-2.animate-spin, [role="dialog"] .animate-spin');
      const isLoading = await loadingSpinner.isVisible({ timeout: 500 }).catch(() => false);

      if (!isLoading) {
        console.log('  Peer list loaded');
        break;
      }

      if (i === 14) {
        console.log('  WARNING: Peer list loading timed out (will retry)');
      }
      await sleep(1000);
    }

    await sleep(1000);

    // Find Connect button for the peer
    const dialog = page.locator('[role="dialog"]');
    const connectButtons = dialog.locator('button:has-text("Connect")');
    const connectCount = await connectButtons.count();
    console.log(`  Found ${connectCount} Connect buttons in dialog`);

    for (let i = 0; i < connectCount && !peerFound; i++) {
      const connectBtn = connectButtons.nth(i);
      const parent = connectBtn.locator('..').locator('..');
      const parentText = await parent.textContent().catch(() => '');
      console.log(`  Button ${i} parent text: "${(parentText ?? '').substring(0, 50)}..."`);

      if ((parentText ?? '').toLowerCase().includes(peerUsername.toLowerCase())) {
        peerFound = true;
        console.log(`  Found peer ${peerUsername}, clicking Connect...`);
        await connectBtn.click();
        await sleep(3000);
        console.log(`  P2P registration request sent`);
        break;
      }
    }

    // Method 2: Look for peer username text
    if (!peerFound) {
      const peerText = dialog.locator(`text="${peerUsername}"`).first();
      if (await peerText.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`  Found peer text, looking for Connect button nearby...`);
        const container = peerText.locator('xpath=ancestor::div[.//button[contains(text(), "Connect")]]').first();
        const connectBtn = container.locator('button:has-text("Connect")');
        if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          peerFound = true;
          console.log(`  Found peer ${peerUsername}, clicking Connect...`);
          await connectBtn.click();
          await sleep(3000);
          console.log(`  P2P registration request sent`);
        }
      }
    }

    if (!peerFound && retry < MAX_RETRIES - 1) {
      const visiblePeers = await page.locator('[role="dialog"] div.rounded-lg p.font-medium').allTextContents().catch(() => []);
      console.log(`  Peer not found yet. Available: ${visiblePeers.join(', ') || 'none'}. Retrying...`);
    }
  }

  console.log(`  DEBUG: After retry loop, peerFound = ${peerFound}`);

  if (!peerFound) {
    const visiblePeers = await page.locator('[role="dialog"] div.rounded-lg p.font-medium').allTextContents().catch(() => []);
    console.log(`  Available peers: ${visiblePeers.join(', ') || 'none'}`);
    if (uxTracker) {
      uxTracker.log('major', 'functional', `Peer ${peerUsername} not found after ${MAX_RETRIES} retries. Available: ${visiblePeers.join(', ')}`);
    }
    await takeScreenshot(page, `${myUsername}_peer_not_found`);
  } else {
    console.log(`  SUCCESS: Peer ${peerUsername} found and Connect clicked`);
  }

  await page.keyboard.press('Escape');
  await sleep(500);
  return peerFound;
}

/**
 * Accept a pending P2P request
 */
export async function acceptP2PRequest(
  page: Page,
  username: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Checking for P2P requests ===`);

  await waitForWorkspaceLoaded(page, 30000);
  await sleep(3000); // Give more time for P2P notification to arrive

  // Look for pending request badge - Badge component has title attribute and bg-red-500 class
  // The Badge is NOT a button, it's a div/span from shadcn/ui
  let badge = page.locator('[title*="pending connection request"]').first();

  if (!await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Badge by title not found, trying bg-red-500 class...');
    // Fallback: look for any element with bg-red-500 class (the badge color)
    badge = page.locator('.bg-red-500').first();
  }

  // Wait longer for the badge to appear - P2P registration notification may take time
  const MAX_WAIT_ATTEMPTS = 10;
  for (let i = 0; i < MAX_WAIT_ATTEMPTS; i++) {
    if (await badge.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  Found pending request badge (attempt ${i + 1})`);
      await badge.click();
      await sleep(2000);

      await takeScreenshot(page, `${username}_pending_requests`);

      const acceptBtn = page.locator('button:has-text("Accept")');
      if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await acceptBtn.click();
        await sleep(3000);
        console.log(`  P2P request accepted`);

        await page.keyboard.press('Escape');
        await sleep(500);
        return true;
      } else {
        if (uxTracker) {
          uxTracker.log('major', 'functional', 'Accept button not found in pending requests modal');
        }
        break;
      }
    }
    console.log(`  Waiting for pending request badge... (${i + 1}/${MAX_WAIT_ATTEMPTS})`);
    await sleep(2000);
  }

  console.log(`  No pending P2P request badge found after ${MAX_WAIT_ATTEMPTS} attempts`);
  await closeAnyModals(page);
  return false;
}

/**
 * Wait for P2PChat component to be fully ready (mounted with listener registered)
 */
async function waitForChatReady(page: Page, _peerUsername: string): Promise<void> {
  console.log(`  Waiting for P2PChat to be fully ready...`);

  // Wait for the message input to be visible and enabled
  const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]').first();

  for (let i = 0; i < 10; i++) {
    if (await messageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Also check if it's enabled (not disabled)
      const isDisabled = await messageInput.isDisabled().catch(() => true);
      if (!isDisabled) {
        console.log(`  P2PChat ready (message input enabled)`);
        // Extra wait to ensure React useEffect has run and listener is registered
        await sleep(2000);
        return;
      }
    }
    console.log(`  Waiting for chat input... (${i + 1}/10)`);
    await sleep(1000);
  }

  // Fallback: just wait extra time if input not found
  console.log(`  Chat input not found, waiting extra time...`);
  await sleep(5000);
}

/**
 * Open a conversation with a peer
 */
export async function openConversation(
  page: Page,
  username: string,
  peerUsername: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Opening conversation with ${peerUsername} ===`);

  await waitForWorkspaceLoaded(page, 30000);
  await closeAnyModals(page);
  await sleep(1000);

  // Wait for peer to appear in sidebar
  for (let attempt = 0; attempt < 15; attempt++) {
    // Look in DIRECT MESSAGES section
    const dmSection = page.locator('text="DIRECT MESSAGES"').locator('..').locator('..');
    const peerInDM = dmSection.locator(`text="${peerUsername}"`).first();

    if (await peerInDM.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Found ${peerUsername} in DIRECT MESSAGES`);
      await peerInDM.click();
      await sleep(2000);
      // Wait for P2PChat component to fully mount by checking for the message input
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Also check WORKSPACE MEMBERS section
    const wsSection = page.locator('text="WORKSPACE MEMBERS"').locator('..').locator('..');
    const peerInWS = wsSection.locator(`text="${peerUsername}"`).first();

    if (await peerInWS.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`  Found ${peerUsername} in WORKSPACE MEMBERS`);
      await peerInWS.click();
      await sleep(2000);
      // Wait for P2PChat component to fully mount by checking for the message input
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Try button match
    const peerBtn = page.locator(`button:has-text("${peerUsername}")`).first();
    if (await peerBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`  Found ${peerUsername} via button`);
      await peerBtn.click();
      await sleep(2000);
      // Wait for P2PChat component to fully mount by checking for the message input
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    console.log(`  Waiting for peer in sidebar... (${attempt + 1}/15)`);
    await sleep(2000);
  }

  if (uxTracker) {
    uxTracker.log('critical', 'functional', `Could not find ${peerUsername} in sidebar after 15 attempts`);
  }
  await takeScreenshot(page, `${username}_peer_not_in_sidebar`);
  return false;
}
