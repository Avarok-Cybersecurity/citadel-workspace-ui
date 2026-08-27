/**
 * P2P Connection - connect and disconnect P2P channels
 */

import type { Page } from 'playwright';
import { sleep } from '../utils.js';
import { takeScreenshot } from '../screenshots.js';
import { UxIssueTracker } from '../ux-tracker.js';
import { isVisibleWithin } from '../utils.js';

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
    // Execute in browser context using window-exposed singletons (NOT dynamic imports which create fresh instances)
    const result = await page.evaluate(async (peerUser: string) => {
      // Access actual singleton instances exposed on window by main.tsx
      const websocketService = (window as any).__websocketService;
      const connectionManager = (window as any).__connectionManager;
      const p2pRegistrationService = (window as any).__p2pRegistrationService;
      const p2pAutoConnectService = (window as any).__p2pAutoConnectService;

      if (!websocketService || !connectionManager || !p2pRegistrationService || !p2pAutoConnectService) {
        return { success: false, error: `Missing window services: ws=${!!websocketService} cm=${!!connectionManager} reg=${!!p2pRegistrationService} auto=${!!p2pAutoConnectService}` };
      }

      // Get current session CID
      let sessionCid: bigint | null = null;
      const session = await connectionManager.getTabSelectedSession();
      if (session?.cid) {
        sessionCid = session.cid;
      }
      if (!sessionCid) {
        return { success: false, error: 'No active session from connectionManager' };
      }

      // Find peer CID from registered peers
      const { registeredPeers } = p2pRegistrationService.getPeers();
      let peerCid: bigint | string | null = null;

      for (const peer of registeredPeers) {
        if (peer.username?.toLowerCase() === peerUser.toLowerCase()) {
          peerCid = peer.cid;
          break;
        }
      }

      if (!peerCid) {
        // Check connected peers (may already be connected)
        const connectedPeerCids = await p2pAutoConnectService.getConnectedPeers();
        if (connectedPeerCids && connectedPeerCids.length > 0) {
          for (const cid of connectedPeerCids) {
            const peerInfo = p2pRegistrationService.getPeerInfo(cid);
            if (peerInfo?.username?.toLowerCase() === peerUser.toLowerCase()) {
              return { success: true, alreadyConnected: true };
            }
          }
        }

        if (!peerCid) {
          return { success: false, error: `Peer ${peerUser} not registered. registeredPeers(${registeredPeers?.length || 0}): ${registeredPeers?.map((p: any) => p.username).join(', ') || 'empty'}` };
        }
      }

      // Call openP2PConnection
      try {
        await websocketService.openP2PConnection(sessionCid, peerCid);
        return { success: true };
      } catch (e) {
        const errorMsg = String(e);
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

    const peerVisible = await isVisibleWithin(peerInSidebar, 5000);

    if (peerVisible) {
      console.log(`  P2P connect to ${peerUsername} SUCCESS`);
      await takeScreenshot(page, `${username}_p2p_connected`);
      return true;
    }

    // Request send is not response. This returned TRUE here — the peer never
    // appeared under CONNECTED PEERS, which is this function's entire
    // verification — and it is the documented retry fallback for PeerConnect
    // timeouts, so it reported the retry as having worked in exactly the case
    // where it had not.
    console.log(`  FAIL: P2P connect to ${peerUsername} sent, but the peer never appeared as connected`);
    await takeScreenshot(page, `${username}_p2p_connect_unconfirmed`);
    return false;

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
      // Execute in browser context using window-exposed singletons (NOT dynamic imports which create fresh instances)
      const result = await page.evaluate(async (peerUser: string) => {
        // Access actual singleton instances exposed on window by main.tsx
        const websocketService = (window as any).__websocketService;
        const connectionManager = (window as any).__connectionManager;
        const p2pAutoConnectService = (window as any).__p2pAutoConnectService;
        const p2pRegistrationService = (window as any).__p2pRegistrationService;

        if (!websocketService || !connectionManager || !p2pAutoConnectService || !p2pRegistrationService) {
          return { success: false, error: `Missing window services: ws=${!!websocketService} cm=${!!connectionManager} auto=${!!p2pAutoConnectService} reg=${!!p2pRegistrationService}`, retryable: false };
        }

        // Get current session CID
        let sessionCid: bigint | null = null;
        const session = await connectionManager.getTabSelectedSession();
        if (session?.cid) {
          sessionCid = session.cid;
        }
        if (!sessionCid) {
          return { success: false, error: 'No active session from connectionManager', retryable: false };
        }

        // Find peer CID from connected peers
        const connectedPeerCids = await p2pAutoConnectService.getConnectedPeers();
        let peerCid: bigint | string | null = null;

        const debugInfo: string[] = [];
        debugInfo.push(`connectedPeers(${connectedPeerCids?.length || 0}): ${connectedPeerCids?.map((c: bigint) => c.toString()).join(', ') || 'empty'}`);

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
          const { registeredPeers, allPeers } = p2pRegistrationService.getPeers();
          debugInfo.push(`registeredPeers(${registeredPeers?.length || 0}): ${registeredPeers?.map((p: any) => `${p.username}=${p.cid?.toString()}`).join(', ') || 'empty'}`);
          debugInfo.push(`allPeers(${allPeers?.length || 0}): ${allPeers?.map((p: any) => `${p.username}=${p.cid?.toString()}`).join(', ') || 'empty'}`);
          for (const peer of registeredPeers) {
            if (peer.username?.toLowerCase() === peerUser.toLowerCase()) {
              peerCid = peer.cid;
              break;
            }
          }
        }

        if (!peerCid) {
          // DOM fallback: extract CID from sidebar data-peer-cid attribute
          const allPeerRows = Array.from(document.querySelectorAll('[data-peer-cid]'));
          for (const row of allPeerRows) {
            const text = row.textContent || '';
            if (text.toLowerCase().includes(peerUser.toLowerCase())) {
              const cidStr = (row as HTMLElement).dataset.peerCid;
              if (cidStr) {
                try { peerCid = BigInt(cidStr); } catch { peerCid = cidStr; }
                debugInfo.push(`DOM fallback: found CID ${cidStr} for ${peerUser}`);
                break;
              }
            }
          }
        }

        if (!peerCid) {
          return { success: false, error: `Peer ${peerUser} not found. Debug: ${debugInfo.join(' | ')}`, retryable: false };
        }

        // Call disconnectP2P
        try {
          await websocketService.disconnectP2P(sessionCid, peerCid);
          return { success: true };
        } catch (e) {
          const errorMsg = String(e);
          if (errorMsg.includes('Peer connection not found') ||
              errorMsg.includes('not connected') ||
              errorMsg.includes('not found')) {
            return { success: true, alreadyDisconnected: true };
          }
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
      // PRIMARY: Check ACTUAL connection state via window-exposed singletons
      const isConnected = await page.evaluate(async (peerUser: string) => {
        try {
          const p2pAutoConnectService = (window as any).__p2pAutoConnectService;
          const p2pRegistrationService = (window as any).__p2pRegistrationService;
          if (!p2pAutoConnectService || !p2pRegistrationService) {
            return { connected: false, reason: 'window services not available' };
          }

          const { registeredPeers } = p2pRegistrationService.getPeers();
          const peer = registeredPeers.find(
            (p: { username?: string }) => p.username?.toLowerCase() === peerUser.toLowerCase()
          );
          if (!peer?.cid) return { connected: false, reason: 'peer not found in registry' };

          const peerCid = typeof peer.cid === 'bigint' ? peer.cid : BigInt(peer.cid);
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
      const isVisible = await isVisibleWithin(peerInConnected, 200);

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
      // Check if channel is ready using window-exposed singletons
      const result = await page.evaluate(async (peerUser: string) => {
        try {
          const p2pAutoConnectService = (window as any).__p2pAutoConnectService;
          const p2pRegistrationService = (window as any).__p2pRegistrationService;
          if (!p2pAutoConnectService || !p2pRegistrationService) {
            return { ready: false, reason: 'window services not available' };
          }

          const { registeredPeers } = p2pRegistrationService.getPeers();
          const peer = registeredPeers.find(
            (p: { username?: string }) => p.username?.toLowerCase() === peerUser.toLowerCase()
          );
          if (!peer?.cid) return { ready: false, reason: 'peer not found in registry' };

          const peerCid = typeof peer.cid === 'bigint' ? peer.cid : BigInt(peer.cid);

          const ready = p2pAutoConnectService.isChannelReady(peerCid);
          if (ready) {
            return { ready: true, reason: 'channel proven ready via message receipt' };
          }

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
