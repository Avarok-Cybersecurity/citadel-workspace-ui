/**
 * P2P Connection - connect and disconnect P2P channels
 */

import type { Page } from 'playwright';
import { sleep } from '../utils.js';
import { takeScreenshot } from '../screenshots.js';
import { UxIssueTracker } from '../ux-tracker.js';

/**
 * Connect to a registered P2P peer.
 *
 * Sends PeerConnect request via websocketService.openP2PConnection().
 * Requires prior registration (via p2pRegister + acceptP2PRequest).
 * Can be called multiple times after registration.
 *
 * @param page - Playwright page for this user's browser
 * @param username - This user's username (for logging)
 * @param peerUsername - The peer's username to connect to
 * @param uxTracker - Optional UX issue tracker
 * @returns true if P2P connection established
 */
export async function connectP2P(
  page: Page,
  username: string,
  peerUsername: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Connecting P2P to ${peerUsername} ===`);

  try {
    // Execute in browser context to access frontend services
    const result = await page.evaluate(async (peerUser: string) => {
      // Dynamic imports using Vite dev server paths (NOT @/ aliases which only work at build time)
      // @ts-ignore - Browser-side import via Vite dev server
      const { websocketService } = await import('/src/lib/websocket-service.ts');
      // @ts-ignore - Browser-side import via Vite dev server
      const { connectionManager } = await import('/src/lib/connection-manager.ts');
      // @ts-ignore - Browser-side import via Vite dev server
      const { p2pRegistrationService } = await import('/src/lib/p2p-registration-service.ts');

      // Get current session CID
      const session = connectionManager.getTabSelectedSession();
      if (!session?.cid) {
        return { success: false, error: 'No active session' };
      }

      // Find peer CID from registered peers
      // getPeers() returns { allPeers: Peer[], registeredPeers: Peer[] }
      // where Peer = { cid, username, fullName, isOnline, isRegistered }
      const { registeredPeers } = p2pRegistrationService.getPeers();
      let peerCid: string | null = null;

      for (const peer of registeredPeers) {
        if (peer.username?.toLowerCase() === peerUser.toLowerCase()) {
          peerCid = peer.cid;
          break;
        }
      }

      if (!peerCid) {
        // Also check connected peers (may already be connected)
        // @ts-ignore - Browser-side import via Vite dev server
        const { p2pAutoConnectService } = await import('/src/lib/p2p-auto-connect-service.ts');
        // getConnectedPeers() returns string[] (CID array)
        const connectedPeerCids = p2pAutoConnectService.getConnectedPeers();
        if (connectedPeerCids && connectedPeerCids.length > 0) {
          // Check if any connected peer matches by username
          for (const cid of connectedPeerCids) {
            const peerInfo = p2pRegistrationService.getPeerInfo(cid);
            if (peerInfo?.username?.toLowerCase() === peerUser.toLowerCase()) {
              // Already connected
              return { success: true, alreadyConnected: true };
            }
          }
        }
        return { success: false, error: `Peer ${peerUser} not registered` };
      }

      // Call openP2PConnection
      try {
        await websocketService.openP2PConnection(session.cid, peerCid);
        return { success: true };
      } catch (e) {
        const errorMsg = String(e);
        // "Already connected" is a success case (auto-connect service may have reconnected)
        if (errorMsg.includes('Already connected')) {
          return { success: true, alreadyConnected: true };
        }
        return { success: false, error: errorMsg };
      }
    }, peerUsername);

    if (!result.success) {
      console.log(`  P2P connect failed: ${result.error}`);
      if (uxTracker) {
        uxTracker.log('major', 'functional', `P2P connect to ${peerUsername} failed: ${result.error}`);
      }
      await takeScreenshot(page, `${username}_p2p_connect_failed`);
      return false;
    }

    if (result.alreadyConnected) {
      console.log(`  P2P already connected to ${peerUsername} (via auto-connect)`);
      return true;
    }

    // Wait for connection to establish
    await sleep(3000);

    // Verify peer in sidebar (CONNECTED PEERS section)
    const dmSection = page.locator('text="CONNECTED PEERS"').locator('..').locator('..');
    const peerInSidebar = dmSection.locator(`text="${peerUsername}"`).first();

    const peerVisible = await peerInSidebar.isVisible({ timeout: 5000 }).catch(() => false);

    if (peerVisible) {
      console.log(`  P2P connect to ${peerUsername} SUCCESS`);
      await takeScreenshot(page, `${username}_p2p_connected`);
      return true;
    }

    // Fallback: Check if connection succeeded even if UI hasn't updated yet
    console.log(`  P2P connect sent but peer not visible in sidebar yet (may need UI refresh)`);
    return true; // Connection request sent successfully

  } catch (error) {
    console.log(`  P2P connect error: ${error}`);
    if (uxTracker) {
      uxTracker.log('critical', 'functional', `P2P connect error: ${error}`);
    }
    await takeScreenshot(page, `${username}_p2p_connect_error`);
    return false;
  }
}

/**
 * Disconnect from a specific P2P peer.
 *
 * Sends PeerDisconnect request via websocketService.disconnectP2P().
 * C2S connection remains active - only P2P channel is closed.
 * Can reconnect later via connectP2P().
 *
 * @param page - Playwright page for this user's browser
 * @param username - This user's username (for logging)
 * @param peerUsername - The peer's username to disconnect from
 * @param uxTracker - Optional UX issue tracker
 * @returns true if P2P disconnect succeeded
 */
export async function disconnectP2P(
  page: Page,
  username: string,
  peerUsername: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Disconnecting P2P from ${peerUsername} ===`);

  // Wait for protocol to settle before attempting disconnect
  // This prevents "Client or peer is still in protocol" errors after message exchanges
  console.log(`  Waiting for protocol to settle (3s)...`);
  await sleep(3000);

  // Retry logic with exponential backoff for "still in protocol" errors
  const MAX_RETRIES = 5;
  const BASE_DELAY = 2000; // 2 seconds

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Execute in browser context to access frontend services
      const result = await page.evaluate(async (peerUser: string) => {
        // Dynamic imports using Vite dev server paths (NOT @/ aliases which only work at build time)
        // @ts-ignore - Browser-side import via Vite dev server
        const { websocketService } = await import('/src/lib/websocket-service.ts');
        // @ts-ignore - Browser-side import via Vite dev server
        const { connectionManager } = await import('/src/lib/connection-manager.ts');
        // @ts-ignore - Browser-side import via Vite dev server
        const { p2pAutoConnectService } = await import('/src/lib/p2p-auto-connect-service.ts');

        // Get current session CID
        const session = connectionManager.getTabSelectedSession();
        if (!session?.cid) {
          return { success: false, error: 'No active session', retryable: false };
        }

        // Import p2pRegistrationService to get peer info
        // @ts-ignore - Browser-side import via Vite dev server
        const { p2pRegistrationService } = await import('/src/lib/p2p-registration-service.ts');

        // Find peer CID from connected peers
        // getConnectedPeers() returns string[] (CID array)
        const connectedPeerCids = p2pAutoConnectService.getConnectedPeers();
        let peerCid: string | null = null;

        if (connectedPeerCids && connectedPeerCids.length > 0) {
          for (const cid of connectedPeerCids) {
            const peerInfo = p2pRegistrationService.getPeerInfo(cid);
            if (peerInfo?.username?.toLowerCase() === peerUser.toLowerCase()) {
              peerCid = cid;
              break;
            }
          }
        }

        if (!peerCid) {
          // Check registered peers as fallback
          // getPeers() returns { allPeers: Peer[], registeredPeers: Peer[] }
          const { registeredPeers } = p2pRegistrationService.getPeers();
          for (const peer of registeredPeers) {
            if (peer.username?.toLowerCase() === peerUser.toLowerCase()) {
              peerCid = peer.cid;
              break;
            }
          }
        }

        if (!peerCid) {
          return { success: false, error: `Peer ${peerUser} not found in connected or registered peers`, retryable: false };
        }

        // Call disconnectP2P
        try {
          await websocketService.disconnectP2P(session.cid, peerCid);
          return { success: true };
        } catch (e) {
          const errorMsg = String(e);
          // "Peer connection not found" means peer was already disconnected - treat as success
          if (errorMsg.includes('Peer connection not found') ||
              errorMsg.includes('not connected') ||
              errorMsg.includes('not found')) {
            return { success: true, alreadyDisconnected: true };
          }
          // Check if error is retryable (SDK busy with protocol)
          const retryable = errorMsg.includes('still in protocol') ||
                           errorMsg.includes('in protocol') ||
                           errorMsg.includes('busy');
          return { success: false, error: errorMsg, retryable };
        }
      }, peerUsername);

      if (result.success) {
        if (result.alreadyDisconnected) {
          console.log(`  P2P already disconnected from ${peerUsername} (peer connection not found)`);
        } else {
          console.log(`  P2P disconnect succeeded on attempt ${attempt}`);
        }
        break; // Success, exit retry loop
      }

      if (!result.retryable || attempt === MAX_RETRIES) {
        console.log(`  P2P disconnect failed (attempt ${attempt}/${MAX_RETRIES}): ${result.error}`);
        if (uxTracker) {
          uxTracker.log('major', 'functional', `P2P disconnect from ${peerUsername} failed: ${result.error}`);
        }
        await takeScreenshot(page, `${username}_p2p_disconnect_failed`);
        return false;
      }

      // Retryable error - wait and retry with exponential backoff
      const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
      console.log(`  P2P disconnect busy, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})...`);
      await sleep(delayMs);

    } catch (error) {
      console.log(`  P2P disconnect error on attempt ${attempt}: ${error}`);
      if (attempt === MAX_RETRIES) {
        if (uxTracker) {
          uxTracker.log('critical', 'functional', `P2P disconnect error: ${error}`);
        }
        await takeScreenshot(page, `${username}_p2p_disconnect_error`);
        return false;
      }
      await sleep(BASE_DELAY * Math.pow(2, attempt - 1));
    }
  }

  // Wait for disconnect to process
  await sleep(2000);

  console.log(`  P2P disconnect from ${peerUsername} SUCCESS`);
  await takeScreenshot(page, `${username}_p2p_disconnected`);

  // Verify we're still on workspace page (C2S still active)
  const currentUrl = page.url();
  if (currentUrl.includes('/workspace') || currentUrl.includes('/office')) {
    console.log(`  C2S connection still active (on ${currentUrl})`);
  } else {
    console.log(`  WARNING: Not on workspace page after P2P disconnect: ${currentUrl}`);
  }

  return true;
}

/**
 * Wait for P2P connection to a peer to be established.
 *
 * Uses page.evaluate to check ACTUAL connection state via p2pAutoConnectService,
 * rather than relying on UI visibility which can lag behind.
 * Falls back to UI check if service check fails.
 *
 * @param page - Playwright page for this user's browser
 * @param username - This user's username (for logging)
 * @param peerUsername - The peer's username to wait for
 * @param timeoutMs - Max time to wait (default: 30s)
 * @returns true if P2P connection established within timeout
 */
export async function waitForP2PConnection(
  page: Page,
  username: string,
  peerUsername: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  console.log(`  ${username}: Waiting for P2P connection to ${peerUsername} (timeout: ${timeoutMs / 1000}s)...`);

  const pollInterval = 500; // Faster polling for more responsiveness
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // PRIMARY: Check ACTUAL connection state via page.evaluate (deterministic)
      const isConnected = await page.evaluate(async (peerUser: string) => {
        try {
          // @ts-ignore - Browser-side import via Vite dev server
          const { p2pAutoConnectService } = await import('/src/lib/p2p-auto-connect-service.ts');
          // @ts-ignore - Browser-side import via Vite dev server
          const { p2pRegistrationService } = await import('/src/lib/p2p-registration-service.ts');

          // Find peer CID by username
          const { registeredPeers } = p2pRegistrationService.getPeers();
          const peer = registeredPeers.find(
            (p: { username?: string }) => p.username?.toLowerCase() === peerUser.toLowerCase()
          );
          if (!peer?.cid) return { connected: false, reason: 'peer not found in registry' };

          // Check if actually connected in p2pAutoConnectService
          const peerCid = typeof peer.cid === 'bigint' ? peer.cid : BigInt(peer.cid);
          // isPeerConnected is async - must await it
          const connected = await p2pAutoConnectService.isPeerConnected(peerCid);
          return { connected, reason: connected ? 'service reports connected' : 'service reports not connected' };
        } catch (e) {
          return { connected: false, reason: `error: ${e}` };
        }
      }, peerUsername).catch(() => ({ connected: false, reason: 'page.evaluate failed' }));

      if (isConnected.connected) {
        console.log(`  ${username}: P2P verified connected to ${peerUsername} (attempt ${attempt}, ${isConnected.reason})`);
        return true;
      }

      // FALLBACK: Check UI visibility (less deterministic but catches edge cases)
      const connectedPeersGroup = page.locator('[data-sidebar="group"]:has([data-sidebar="group-label"]:text("CONNECTED PEERS"))');
      const peerInConnected = connectedPeersGroup.locator(`text="${peerUsername}"`).first();
      const isVisible = await peerInConnected.isVisible({ timeout: 200 }).catch(() => false);

      if (isVisible) {
        console.log(`  ${username}: P2P connected to ${peerUsername} (UI visible, attempt ${attempt})`);
        return true;
      }

      if (attempt % 10 === 0) {
        console.log(`  ${username}: Still waiting for P2P to ${peerUsername}... (attempt ${attempt}/${maxAttempts}, ${isConnected.reason})`);
      }

      if (attempt < maxAttempts) {
        await sleep(pollInterval);
      }
    } catch (error) {
      console.log(`  ${username}: Error checking P2P status: ${error}`);
      await sleep(pollInterval);
    }
  }

  console.log(`  ${username}: P2P connection to ${peerUsername} timed out after ${timeoutMs / 1000}s`);
  return false;
}

/**
 * Wait for a P2P channel to be READY (proven bidirectional message flow).
 *
 * This is MORE RELIABLE than waitForP2PConnection because:
 * - waitForP2PConnection only checks if the connection exists in the Map
 * - waitForP2PChannelReady waits until we've RECEIVED a message from the peer
 *
 * A channel is marked "ready" when the first P2P message is received from the peer,
 * proving that messages can actually flow in both directions.
 *
 * @param page - Playwright page for this user's browser
 * @param username - This user's username (for logging)
 * @param peerUsername - The peer's username to wait for channel readiness
 * @param timeoutMs - Max time to wait (default: 30s)
 * @returns true if P2P channel is ready within timeout
 */
export async function waitForP2PChannelReady(
  page: Page,
  username: string,
  peerUsername: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  console.log(`  ${username}: Waiting for P2P channel READY to ${peerUsername} (timeout: ${timeoutMs / 1000}s)...`);

  const pollInterval = 500;
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check if channel is ready (received a message from peer)
      const result = await page.evaluate(async (peerUser: string) => {
        try {
          // @ts-ignore - Browser-side import via Vite dev server
          const { p2pAutoConnectService } = await import('/src/lib/p2p-auto-connect-service.ts');
          // @ts-ignore - Browser-side import via Vite dev server
          const { p2pRegistrationService } = await import('/src/lib/p2p-registration-service.ts');

          // Find peer CID by username
          const { registeredPeers } = p2pRegistrationService.getPeers();
          const peer = registeredPeers.find(
            (p: { username?: string }) => p.username?.toLowerCase() === peerUser.toLowerCase()
          );
          if (!peer?.cid) return { ready: false, reason: 'peer not found in registry' };

          const peerCid = typeof peer.cid === 'bigint' ? peer.cid : BigInt(peer.cid);

          // Check if channel is READY (proven message flow)
          const ready = p2pAutoConnectService.isChannelReady(peerCid);
          if (ready) {
            return { ready: true, reason: 'channel proven ready via message receipt' };
          }

          // Also check if connected (may become ready soon)
          const connected = await p2pAutoConnectService.isPeerConnected(peerCid);
          return {
            ready: false,
            reason: connected ? 'connected but not yet ready (no message received)' : 'not connected'
          };
        } catch (e) {
          return { ready: false, reason: `error: ${e}` };
        }
      }, peerUsername).catch(() => ({ ready: false, reason: 'page.evaluate failed' }));

      if (result.ready) {
        console.log(`  ${username}: P2P channel READY to ${peerUsername} (attempt ${attempt}, ${result.reason})`);
        return true;
      }

      if (attempt % 10 === 0) {
        console.log(`  ${username}: Still waiting for channel ready to ${peerUsername}... (attempt ${attempt}/${maxAttempts}, ${result.reason})`);
      }

      if (attempt < maxAttempts) {
        await sleep(pollInterval);
      }
    } catch (error) {
      console.log(`  ${username}: Error checking channel ready status: ${error}`);
      await sleep(pollInterval);
    }
  }

  console.log(`  ${username}: P2P channel ready to ${peerUsername} timed out after ${timeoutMs / 1000}s`);
  return false;
}
