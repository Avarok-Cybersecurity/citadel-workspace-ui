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

  // Bring tab to front
  await page.bringToFront();

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

/**
 * Simulate TCP drop by closing the page.
 * This orphans the session (unlike Sign out which removes it entirely).
 *
 * After TCP drop:
 * - Session IS in OrphanSessionsNavbar (can be reclaimed)
 * - P2P ratchets/cryptographic state PERSIST
 * - ILM can deliver queued messages after ClaimSession
 *
 * Use this for testing ILM offline messaging.
 */
export async function disconnectViaTcpDrop(
  page: Page,
  username: string,
  _uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Simulating TCP drop (closing page) ===`);

  try {
    await takeScreenshot(page, `${username}_before_tcp_drop`);

    // Close the page to simulate TCP connection drop
    // This will orphan the session but preserve P2P cryptographic state
    await page.close();

    console.log(`  ${username} page closed (TCP drop simulated)`);
    return true;
  } catch (error) {
    console.log(`  Error during TCP drop simulation: ${error}`);
    return false;
  }
}

/**
 * Assert that a session IS in OrphanSessionsNavbar.
 * This is used to verify that TCP drop orphaned the session properly.
 */
export async function assertSessionInOrphanNavbar(
  page: Page,
  username: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== Asserting ${username} IS in OrphanSessionsNavbar ===`);

  try {
    await takeScreenshot(page, `${username}_landing_orphan_check`);

    // Check for session icon - it SHOULD exist for orphaned session
    const sessionIcon = page.locator(`[data-testid="session-icon-${username}"]`);
    const sessionButton = page.locator(`[data-testid="session-button-${username}"]`);

    // Also try username partial match (in case testid doesn't include full username)
    const usernamePrefix = username.substring(0, 15); // First 15 chars
    const partialMatch = page.locator(`[data-testid*="session"]:has-text("${usernamePrefix}")`).first();

    const iconVisible = await sessionIcon.isVisible({ timeout: 5000 }).catch(() => false);
    const buttonVisible = await sessionButton.isVisible({ timeout: 2000 }).catch(() => false);
    const partialVisible = await partialMatch.isVisible({ timeout: 2000 }).catch(() => false);

    if (iconVisible || buttonVisible || partialVisible) {
      console.log(`  PASS: Session for ${username} FOUND in OrphanSessionsNavbar (as expected)`);
      return true;
    }

    console.log(`  FAIL: Session for ${username} NOT in OrphanSessionsNavbar (unexpected)`);
    if (uxTracker) {
      uxTracker.log('critical', 'functional', `Session for ${username} not found in OrphanSessionsNavbar after TCP drop`);
    }
    await takeScreenshot(page, `${username}_not_orphaned`);
    return false;
  } catch (error) {
    console.log(`  Error checking OrphanSessionsNavbar: ${error}`);
    return false;
  }
}

/**
 * Disconnect via TopBar "Sign out" button.
 * This triggers InternalServiceRequest::Disconnect which:
 * 1. Drops the live connection (session removed from server_connection_map)
 * 2. Removes the session from stored sessions
 * 3. CID stays the same (tied to account credentials)
 *
 * WARNING: This destroys P2P ratchets/cryptographic state!
 * Use disconnectViaTcpDrop instead for ILM testing.
 *
 * After this, the session should NOT appear in OrphanSessionsNavbar because
 * explicit disconnect removes the session (unlike TCP drop which orphans it).
 *
 * The disconnect flow:
 * 1. Click TopBar avatar to open dropdown
 * 2. Click "Sign out" menu item
 * 3. Wait for disconnect to complete (DisconnectNotification)
 * 4. Page navigates to landing automatically
 */
export async function disconnectViaTopBar(
  page: Page,
  username: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Disconnecting via TopBar Sign out ===`);

  try {
    // Make sure workspace is loaded
    const loaded = await waitForWorkspaceLoaded(page, 30000);
    if (!loaded) {
      console.log('  Workspace not loaded, cannot disconnect');
      return false;
    }

    await takeScreenshot(page, `${username}_before_signout`);

    // Click the TopBar avatar to open dropdown menu
    // Primary: use data-testid for reliability
    let avatarButton = page.locator('[data-testid="user-avatar-button"]').first();

    if (!await avatarButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Primary selector failed, trying alternative selectors...');
      // Try any button with Avatar child in the top fixed bar
      avatarButton = page.locator('.fixed.top-0 button:has([class*="Avatar"])').first();
    }

    if (!await avatarButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try button with rounded avatar
      avatarButton = page.locator('button:has(.h-8.w-8.rounded-full)').first();
    }

    if (!await avatarButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try finding AvatarFallback (shows user initials) and get parent button
      const avatarFallback = page.locator('.bg-\\[\\#444A6C\\]').first();
      if (await avatarFallback.isVisible({ timeout: 2000 }).catch(() => false)) {
        avatarButton = avatarFallback.locator('xpath=ancestor::button[1]');
      }
    }

    if (!await avatarButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Avatar button not found in TopBar');
      if (uxTracker) {
        uxTracker.log('major', 'functional', 'Avatar button not found in TopBar');
      }
      await takeScreenshot(page, `${username}_avatar_not_found`);
      return false;
    }

    console.log('  Found avatar button, clicking...');
    await avatarButton.click();

    await sleep(1000);
    await takeScreenshot(page, `${username}_dropdown_opened`);

    // Click "Sign out" in the dropdown menu
    // Radix UI DropdownMenu renders items with role="menuitem"
    // Try multiple selectors to be robust
    let signOutBtn = page.locator('[role="menuitem"]:has-text("Sign out")').first();

    if (!await signOutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try text match with exact text
      signOutBtn = page.locator('text="Sign out"').first();
    }

    if (!await signOutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try div with text content (Radix renders as div)
      signOutBtn = page.locator('div:text-is("Sign out")').first();
    }

    if (!await signOutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try any element containing the text (case insensitive)
      signOutBtn = page.locator('text=/sign out/i').first();
    }

    if (!await signOutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Sign out button not found in dropdown');
      // Debug: List all visible menu items
      const menuItems = await page.locator('[role="menuitem"]').allTextContents().catch(() => []);
      console.log(`  Available menu items: ${menuItems.join(', ') || 'none found'}`);
      if (uxTracker) {
        uxTracker.log('major', 'functional', 'Sign out button not found in dropdown');
      }
      await takeScreenshot(page, `${username}_signout_not_found`);
      // Close dropdown
      await page.keyboard.press('Escape');
      return false;
    }

    console.log('  Clicking Sign out...');
    await signOutBtn.click();

    // Wait for disconnect to complete and page to navigate to landing
    await sleep(3000);

    // Verify we're on landing page
    const config = await import('./config.js');
    const currentUrl = page.url();
    if (!currentUrl.includes(config.config.BASE_URL) || currentUrl.includes('/office')) {
      console.log(`  Expected landing page but got: ${currentUrl}`);
      // Try waiting a bit more for navigation
      await sleep(2000);
    }

    console.log(`  ${username} signed out successfully`);
    await takeScreenshot(page, `${username}_signed_out`);
    return true;
  } catch (error) {
    console.log(`  Error during sign out: ${error}`);
    await takeScreenshot(page, `${username}_signout_error`);
    return false;
  }
}

/**
 * Assert that a session is NOT in OrphanSessionsNavbar.
 * This is used to verify that explicit Disconnect removed the session entirely
 * (as opposed to TCP drop which would orphan it).
 */
export async function assertSessionNotInOrphanNavbar(
  page: Page,
  username: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== Asserting ${username} NOT in OrphanSessionsNavbar ===`);

  try {
    // Navigate to landing page where OrphanSessionsNavbar would be visible
    const config = await import('./config.js');
    await page.goto(config.config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await sleep(3000);

    await takeScreenshot(page, `${username}_landing_for_orphan_check`);

    // Check for session icon - it should NOT exist
    const sessionIcon = page.locator(`[data-testid="session-icon-${username}"]`);
    const sessionButton = page.locator(`[data-testid="session-button-${username}"]`);

    const iconVisible = await sessionIcon.isVisible({ timeout: 2000 }).catch(() => false);
    const buttonVisible = await sessionButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (iconVisible || buttonVisible) {
      console.log(`  FAIL: Session for ${username} FOUND in OrphanSessionsNavbar (unexpected)`);
      if (uxTracker) {
        uxTracker.log('critical', 'functional', `Session for ${username} found in OrphanSessionsNavbar after explicit disconnect`);
      }
      await takeScreenshot(page, `${username}_unexpectedly_orphaned`);
      return false;
    }

    console.log(`  PASS: Session for ${username} NOT in OrphanSessionsNavbar (as expected)`);
    return true;
  } catch (error) {
    console.log(`  Error checking OrphanSessionsNavbar: ${error}`);
    return false;
  }
}

/**
 * Login with existing credentials after disconnect.
 * This is used to reconnect after explicit disconnect (NOT for orphan ClaimSession).
 *
 * The login flow:
 * 1. Navigate to landing page
 * 2. Click "Login" button
 * 3. Enter username and password
 * 4. Submit form
 * 5. Wait for workspace to load
 * 6. Wait for p2pAutoConnectService to establish peer connections
 */
export async function loginAfterDisconnect(
  page: Page,
  username: string,
  password: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Logging in after disconnect ===`);

  try {
    // Navigate to landing page
    const config = await import('./config.js');
    await page.goto(config.config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await sleep(2000);

    await takeScreenshot(page, `${username}_landing_for_login`);

    // Click "Login" button to open login form
    const loginBtn = page.locator('button:has-text("Login")').first();

    if (!await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check if we're already on login form
      const usernameInput = page.locator('input[placeholder*="username"], input[name="username"]').first();
      if (!await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('  Login button not found');
        if (uxTracker) {
          uxTracker.log('major', 'functional', 'Login button not found on landing page');
        }
        await takeScreenshot(page, `${username}_login_btn_not_found`);
        return false;
      }
      // Already on login form, proceed
    } else {
      console.log('  Clicking Login button...');
      await loginBtn.click();
      await sleep(1500);
    }

    await takeScreenshot(page, `${username}_login_form`);

    // Fill in username
    const usernameInput = page.locator('input[placeholder*="username"], input[name="username"]').first();
    if (!await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Username input not found');
      return false;
    }
    await usernameInput.fill(username);

    // Fill in password
    const passwordInput = page.locator('input[type="password"]').first();
    if (!await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Password input not found');
      return false;
    }
    await passwordInput.fill(password);

    await sleep(500);
    await takeScreenshot(page, `${username}_credentials_filled`);

    // Submit the form
    const submitBtn = page.locator('button[type="submit"]:has-text("Login"), button:has-text("Sign In"), button:has-text("Log In")').first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      // Try pressing Enter
      await passwordInput.press('Enter');
    }

    console.log('  Waiting for login to complete...');
    await sleep(5000);

    // Wait for workspace to load
    const loaded = await waitForWorkspaceLoaded(page, 45000);
    if (!loaded) {
      console.log('  Workspace did not load after login');
      await takeScreenshot(page, `${username}_login_workspace_failed`);
      return false;
    }

    console.log(`  ${username} logged in successfully`);
    await takeScreenshot(page, `${username}_logged_in`);

    // Wait for p2pAutoConnectService to establish peer connections
    // The service polls every 5 minutes, but on startup it runs immediately
    console.log('  Waiting for P2P auto-connect service to establish connections...');
    await sleep(10000); // Give p2pAutoConnectService time to start and connect

    return true;
  } catch (error) {
    console.log(`  Error during login: ${error}`);
    await takeScreenshot(page, `${username}_login_error`);
    return false;
  }
}

/**
 * @deprecated Use disconnectViaTopBar instead for explicit disconnect
 *
 * Disconnect via OrphanSessionsNavbar on landing page.
 * This is for ORPHANED sessions (after TCP drop), not for explicit disconnect.
 *
 * For explicit disconnect, use disconnectViaTopBar which triggers
 * InternalServiceRequest::Disconnect.
 */
export async function disconnectViaNavbar(
  page: Page,
  username: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Disconnecting via landing page (DEPRECATED - use disconnectViaTopBar) ===`);

  try {
    // Navigate to landing page where OrphanSessionsNavbar is visible
    const config = await import('./config.js');
    await page.goto(config.config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await sleep(3000);

    await takeScreenshot(page, `${username}_landing_for_disconnect`);

    // Look for the session icon using data-testid
    const sessionIcon = page.locator(`[data-testid="session-icon-${username}"]`);

    if (!await sessionIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`  Session icon for ${username} not found on landing page`);

      // Try alternative: look for any session icons with matching username text
      const altSessionIcon = page.locator(`[data-session-cid]:has-text("${username}")`).first();
      if (!await altSessionIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (uxTracker) {
          uxTracker.log('major', 'functional', `Session icon for ${username} not found on landing page`);
        }
        await takeScreenshot(page, `${username}_session_icon_not_found`);
        return false;
      }
      // Use the alternative selector
      await altSessionIcon.hover();
      await sleep(500);
    } else {
      // Hover over session icon to reveal disconnect button
      await sessionIcon.hover();
      await sleep(500);
    }

    await takeScreenshot(page, `${username}_session_icon_hovered`);

    // Look for the disconnect button (appears on hover)
    const disconnectBtn = page.locator(`[data-testid="disconnect-button-${username}"]`);

    if (!await disconnectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Try alternative: look for any X button near the session icon
      const altDisconnectBtn = page.locator(`[data-testid="session-icon-${username}"] ~ button:has(svg.lucide-x), [data-testid="session-icon-${username}"] button:has(svg)`).first();
      if (!await altDisconnectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('  Disconnect button not visible after hover');
        if (uxTracker) {
          uxTracker.log('major', 'functional', 'Disconnect button not visible after hover');
        }
        await takeScreenshot(page, `${username}_disconnect_button_not_visible`);
        return false;
      }
      await altDisconnectBtn.click({ force: true });
    } else {
      console.log('  Found disconnect button, clicking...');
      await disconnectBtn.click({ force: true });
    }

    await sleep(2000);
    await takeScreenshot(page, `${username}_disconnect_modal`);

    // Handle DisconnectConfirmModal - click "Disconnect" button (not "Deregister")
    // The modal has two options: "Disconnect" (yellow) and "Deregister" (red)
    const disconnectConfirmBtn = page.locator('button:has-text("Disconnect")').first();

    if (await disconnectConfirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Clicking Disconnect in confirmation modal...');
      await disconnectConfirmBtn.click();
      await sleep(3000);

      // Wait for loading modal to complete
      const loadingModal = page.locator('text="Disconnecting"');
      if (await loadingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('  Waiting for disconnect to complete...');
        await page.waitForSelector('text="Disconnecting"', { state: 'hidden', timeout: 10000 }).catch(() => {});
      }

      console.log(`  ${username} disconnected successfully`);
      await takeScreenshot(page, `${username}_disconnected`);
      return true;
    }

    console.log('  Disconnect confirmation button not found');
    if (uxTracker) {
      uxTracker.log('major', 'functional', 'Disconnect confirmation button not found in modal');
    }
    await takeScreenshot(page, `${username}_disconnect_confirm_not_found`);
    return false;
  } catch (error) {
    console.log(`  Error during disconnect: ${error}`);
    await takeScreenshot(page, `${username}_disconnect_error`);
    return false;
  }
}

/**
 * Reconnect via ClaimSession (clicking on orphan session icon on landing page)
 * Navigates to landing page and clicks on the session icon to reclaim.
 *
 * The reconnect flow:
 * 1. Navigate to landing page where OrphanSessionsNavbar is displayed
 * 2. Find the session icon with data-testid="session-button-{username}"
 * 3. Click it to trigger ClaimSession
 * 4. Wait for workspace to load
 */
export async function reconnectViaClaimSession(
  page: Page,
  username: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Reconnecting via ClaimSession ===`);

  try {
    // Navigate to landing page
    const config = await import('./config.js');
    await page.goto(config.config.BASE_URL, { waitUntil: 'commit', timeout: 30000 });
    await sleep(3000);

    await takeScreenshot(page, `${username}_landing_for_reconnect`);

    // Look for the session button using data-testid
    // The OrphanSessionIcon component has data-testid="session-button-{username}"
    const sessionButton = page.locator(`[data-testid="session-button-${username}"]`);

    let sessionFound = false;

    if (await sessionButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`  Found session button for ${username}`);
      await sessionButton.click();
      sessionFound = true;
    } else {
      // Try alternative: look for the session icon container
      const sessionIcon = page.locator(`[data-testid="session-icon-${username}"]`);
      if (await sessionIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`  Found session icon for ${username}, clicking...`);
        await sessionIcon.click();
        sessionFound = true;
      } else {
        // Last resort: look for any session with matching text
        const anySession = page.locator(`[data-testid*="session"]:has-text("${username.slice(0, 10)}")`).first();
        if (await anySession.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`  Found session via text match`);
          await anySession.click();
          sessionFound = true;
        }
      }
    }

    if (!sessionFound) {
      console.log('  No session icons found for user');
      if (uxTracker) {
        uxTracker.log('major', 'functional', `No session icons found for ${username} on landing page`);
      }
      await takeScreenshot(page, `${username}_no_sessions`);
      return false;
    }

    await sleep(3000);

    // Wait for workspace to load after claiming session
    const loaded = await waitForWorkspaceLoaded(page, 45000);
    if (!loaded) {
      console.log('  Workspace did not load after claiming session');
      await takeScreenshot(page, `${username}_reconnect_failed`);
      return false;
    }

    console.log(`  ${username} reconnected successfully via ClaimSession`);
    await takeScreenshot(page, `${username}_reconnected`);
    return true;
  } catch (error) {
    console.log(`  Error during reconnect: ${error}`);
    await takeScreenshot(page, `${username}_reconnect_error`);
    return false;
  }
}
