/**
 * P2P Conversation - opening and managing chat conversations
 */

import type { Page } from 'playwright';
import { sleep } from '../utils.js';
import { waitForWorkspaceLoaded, closeAnyModals } from '../modals.js';
import { takeScreenshot } from '../screenshots.js';
import { UxIssueTracker } from '../ux-tracker.js';
import { isVisibleWithin } from '../utils.js';

/**
 * Wait for P2PChat component to be fully ready (mounted with listener registered)
 */
async function waitForChatReady(page: Page, _peerUsername: string): Promise<void> {
  console.log(`  Waiting for P2PChat to be fully ready...`);

  // Wait for the message input to be visible and enabled
  const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]').first();

  for (let i = 0; i < 10; i++) {
    if (await isVisibleWithin(messageInput, 1000)) {
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

  // Bring tab to front
  await page.bringToFront();

  // Logged rather than thrown: these helpers report failure through their
  // return value and the caller decides. Silently discarding it is what made
  // the group-call stall unreadable — the log ended at 'Waiting for workspace
  // to fully load...' and never said whether it arrived.
  if (!(await waitForWorkspaceLoaded(page, 30000))) {
    console.log(`  WARNING: ${username}'s workspace never finished loading; continuing anyway`);
  }
  await closeAnyModals(page);
  await sleep(1000);

  // Wait for peer to appear in sidebar
  for (let attempt = 0; attempt < 15; attempt++) {
    // FIXED: Use SidebarGroup ancestor for section-relative search
    // The header and peer list are siblings within SidebarGroup, not parent-child
    // So we need to find the SidebarGroup containing the section header, then search within it

    // Strategy 1: Look in sidebar for the peer username directly (most reliable)
    // The peer is rendered in a SidebarMenuButton with the username as text
    const sidebarPeer = page.locator(`[data-sidebar="menu-button"]:has-text("${peerUsername}")`).first();
    if (await isVisibleWithin(sidebarPeer, 1000)) {
      console.log(`  Found ${peerUsername} in sidebar via menu-button`);
      await sidebarPeer.click();
      await sleep(2000);
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Strategy 2: Look in CONNECTED PEERS section using proper ancestor traversal
    // Go up to SidebarGroup (data-sidebar="group") which contains both header and content
    const connectedPeersGroup = page.locator('[data-sidebar="group"]:has([data-sidebar="group-label"]:text("CONNECTED PEERS"))');
    const peerInConnected = connectedPeersGroup.locator(`text="${peerUsername}"`).first();
    if (await isVisibleWithin(peerInConnected, 500)) {
      console.log(`  Found ${peerUsername} in CONNECTED PEERS section`);
      await peerInConnected.click();
      await sleep(2000);
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Strategy 3: Look in WORKSPACE MEMBERS section
    const workspaceMembersGroup = page.locator('[data-sidebar="group"]:has([data-sidebar="group-label"]:text("WORKSPACE MEMBERS"))');
    const peerInWorkspace = workspaceMembersGroup.locator(`text="${peerUsername}"`).first();
    if (await isVisibleWithin(peerInWorkspace, 500)) {
      console.log(`  Found ${peerUsername} in WORKSPACE MEMBERS section`);
      await peerInWorkspace.click();
      await sleep(2000);
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Strategy 4: Try button match anywhere in the page
    const peerBtn = page.locator(`button:has-text("${peerUsername}")`).first();
    if (await isVisibleWithin(peerBtn, 500)) {
      console.log(`  Found ${peerUsername} via button`);
      await peerBtn.click();
      await sleep(2000);
      await waitForChatReady(page, peerUsername);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Strategy 5: Just look for any element with the peer's username text
    const peerText = page.locator(`text="${peerUsername}"`).first();
    if (await isVisibleWithin(peerText, 500)) {
      console.log(`  Found ${peerUsername} via text match`);
      await peerText.click();
      await sleep(2000);
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
