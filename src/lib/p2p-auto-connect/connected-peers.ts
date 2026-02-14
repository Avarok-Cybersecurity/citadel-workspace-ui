/**
 * P2P Connected Peers State
 *
 * Core connected peers Map management - the SSOT for peer connections.
 * Follows SBIO principle - pure state operations only.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        CID LIFECYCLE - CRITICAL INFO                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║ CID (Client ID) is a persistent 64-bit identifier assigned per account.      ║
 * ║ Only Register creates a new CID. All reconnection scenarios preserve CID.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { ensureBigInt, ensureBigIntPair } from '../utils';
import type { PeerConnectionInfo } from './types';
import { debugLog } from '@/lib/debug-config';

export class ConnectedPeersState {
  /**
   * SINGLE SOURCE OF TRUTH for peer connections.
   * Structure: Map<localCid, Map<peerCid, PeerConnectionInfo>>
   */
  protected connectedPeers = new Map<bigint, Map<bigint, PeerConnectionInfo>>();

  // ============================================================================
  // Connected Peers Management
  // ============================================================================

  /**
   * Store peer connection locally (bidirectional).
   * CRITICAL: Ensures CIDs are converted to BigInt for Map operations.
   */
  setPeerConnectedLocal(
    localCid: bigint,
    peerCid: bigint,
    peerUsername: string = '',
    localUsername: string = ''
  ): void {
    const now = Date.now();
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    debugLog('P2PAutoConnectState',
      `[ILM-DIAG] setPeerConnectedLocal: INPUT localCid type=${typeof localCid}, peerCid type=${typeof peerCid}`
    );

    // Store forward direction: localCid -> peerCid
    if (!this.connectedPeers.has(localCidBigInt)) {
      this.connectedPeers.set(localCidBigInt, new Map());
    }
    const localPeerMap = this.connectedPeers.get(localCidBigInt)!;
    localPeerMap.set(peerCidBigInt, {
      peerCid: peerCidBigInt,
      peerUsername,
      connectedAt: now,
      lastVerified: now,
    });

    // Store reverse direction: peerCid -> localCid (BIDIRECTIONAL)
    if (!this.connectedPeers.has(peerCidBigInt)) {
      this.connectedPeers.set(peerCidBigInt, new Map());
    }
    const peerPeerMap = this.connectedPeers.get(peerCidBigInt)!;
    peerPeerMap.set(localCidBigInt, {
      peerCid: localCidBigInt,
      peerUsername: localUsername,
      connectedAt: now,
      lastVerified: now,
    });

    const allKeys = Array.from(this.connectedPeers.keys());
    debugLog('P2PAutoConnectState',
      `[ILM-DIAG] setPeerConnectedLocal: STORED BIDIRECTIONAL localCid=${localCidBigInt.toString()} <-> peerCid=${peerCidBigInt.toString()} (local peers: ${localPeerMap.size}, peer peers: ${peerPeerMap.size})`
    );
    debugLog('P2PAutoConnectState',
      `[ILM-DIAG] setPeerConnectedLocal: ALL MAP KEYS (${allKeys.length}): ${allKeys.map((k) => `${k.toString().slice(0, 8)}...(type=${typeof k})`).join(', ')}`
    );
  }

  /**
   * Remove a peer from the connected state (bidirectional).
   */
  setPeerDisconnected(localCid: bigint, peerCid: bigint): void {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    const localPeerMap = this.connectedPeers.get(localCidBigInt);
    if (localPeerMap) {
      localPeerMap.delete(peerCidBigInt);
    }

    const peerPeerMap = this.connectedPeers.get(peerCidBigInt);
    if (peerPeerMap) {
      peerPeerMap.delete(localCidBigInt);
    }

    debugLog('P2PAutoConnectState',
      `[P2PAutoConnect] setPeerDisconnected: ${localCidBigInt.toString().slice(0, 8)} -X- ${peerCidBigInt.toString().slice(0, 8)} (BIDIRECTIONAL)`
    );
  }

  /**
   * Get peer CIDs for a session.
   */
  getPeersForSession(localCid: bigint): bigint[] {
    const localCidBigInt = ensureBigInt(localCid);

    const peerMap = this.connectedPeers.get(localCidBigInt);
    if (!peerMap) {
      const allCids = Array.from(this.connectedPeers.keys());
      if (allCids.length > 0) {
        debugLog('P2PAutoConnectState',
          `getPeersForSession: NO ENTRY for CID ${localCidBigInt.toString().slice(0, 8)}... (type=${typeof localCid}->${typeof localCidBigInt}), but connectedPeers has entries for: ${allCids.map((c) => `${c.toString().slice(0, 8)}(type=${typeof c})`).join(', ')}`
        );
      }
      return [];
    }
    return Array.from(peerMap.keys());
  }

  isPeerConnectedForSession(localCid: bigint, peerCid: bigint): boolean {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);
    const peerMap = this.connectedPeers.get(localCidBigInt);
    return peerMap?.has(peerCidBigInt) ?? false;
  }

  getPeerConnectionInfo(localCid: bigint, peerCid: bigint): PeerConnectionInfo | null {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);
    const peerMap = this.connectedPeers.get(localCidBigInt);
    return peerMap?.get(peerCidBigInt) ?? null;
  }

  getPeerMapForSession(localCid: bigint): Map<bigint, PeerConnectionInfo> {
    const localCidBigInt = ensureBigInt(localCid);
    if (!this.connectedPeers.has(localCidBigInt)) {
      this.connectedPeers.set(localCidBigInt, new Map());
    }
    return this.connectedPeers.get(localCidBigInt)!;
  }

  clearConnectedPeers(localCid: bigint): void {
    const localCidBigInt = ensureBigInt(localCid);
    this.connectedPeers.set(localCidBigInt, new Map());
  }
}
