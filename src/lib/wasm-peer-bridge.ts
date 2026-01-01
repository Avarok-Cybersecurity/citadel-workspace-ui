/**
 * WASM Peer Bridge
 *
 * Bridge between TypeScript frontend and WASM ILM (Intersession Layer Messaging).
 * Provides peer connection data to WASM via a global callback function.
 *
 * This is the key component for making TypeScript the single source of truth
 * for peer connection state. The Rust WASM `connected_peers()` function calls
 * into this JavaScript function instead of maintaining its own internal state.
 *
 * Flow:
 * 1. WASM ILM polls connected_peers() every ~200ms
 * 2. connected_peers() calls window.__citadel_get_peers_for_session(localCid)
 * 3. This function queries P2PAutoConnectService.getPeersForSession(cid)
 * 4. Returns array of peer CIDs as BigUint64Array for WASM consumption
 */

import { p2pAutoConnectService } from './p2p-auto-connect-service';

/**
 * Global function callable from WASM via wasm_bindgen.
 *
 * The Rust side calls:
 *   window.__citadel_get_peers_for_session(local_cid) -> BigUint64Array
 *
 * @param localCid - The local session CID (as bigint from WASM)
 * @returns BigUint64Array of peer CIDs that are currently connected
 */
// DEBUG: Rate-limited logging for diagnostic purposes
let lastLogTime = 0;
const LOG_INTERVAL_MS = 3000; // Log once every 3 seconds
let callCount = 0;

function __citadel_get_peers_for_session(localCid: bigint): BigUint64Array {
  callCount++;

  try {
    if (!p2pAutoConnectService) {
      console.warn(`[P2P][WasmPeerBridge] CALL #${callCount} - p2pAutoConnectService NOT AVAILABLE!`);
      return new BigUint64Array(0);
    }

    const cid = localCid.toString();
    const peers = p2pAutoConnectService.getPeersForSession(cid);

    // DEBUG: Rate-limited logging to trace peer lookups
    const now = Date.now();
    if (now - lastLogTime > LOG_INTERVAL_MS || peers.length > 0) {
      lastLogTime = now;
      console.log(`[P2P][WasmPeerBridge] CALL #${callCount} getPeersForSession(${cid.slice(0, 8)}...): ${peers.length} peers`,
        peers.length > 0 ? peers.map(p => p.slice(0, 8) + '...') : '(none)');
    }

    // Convert string CIDs to BigUint64Array for WASM
    return new BigUint64Array(peers.map(p => BigInt(p)));
  } catch (error) {
    console.error(`[P2P][WasmPeerBridge] CALL #${callCount} Error:`, error);
    return new BigUint64Array(0);
  }
}

// Expose the function globally for WASM to call
declare global {
  interface Window {
    __citadel_get_peers_for_session: typeof __citadel_get_peers_for_session;
  }
}

/**
 * Initialize the WASM Peer Bridge.
 * Must be called before WASM starts polling connected_peers().
 * Typically called in main.tsx during app initialization.
 */
export function initWasmPeerBridge(): void {
  if (typeof window !== 'undefined') {
    window.__citadel_get_peers_for_session = __citadel_get_peers_for_session;
    console.log('[WasmPeerBridge] Initialized - global callback registered');
  } else {
    console.warn('[WasmPeerBridge] Window not available - skipping initialization');
  }
}

/**
 * Check if the WASM Peer Bridge is initialized.
 */
export function isWasmPeerBridgeInitialized(): boolean {
  return typeof window !== 'undefined' && typeof window.__citadel_get_peers_for_session === 'function';
}
