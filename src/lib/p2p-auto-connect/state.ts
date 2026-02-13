/**
 * P2P Connection State Manager
 *
 * Manages the single source of truth for peer connections.
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
import type { ConnectionAttempt, PeerConnectionInfo } from './types';
import { debugLog } from '@/lib/debug-config';

export class P2PConnectionState {
  /**
   * SINGLE SOURCE OF TRUTH for peer connections.
   * Structure: Map<localCid, Map<peerCid, PeerConnectionInfo>>
   *
   * Updated by:
   * - INSTANT: setPeerConnected() on PeerConnectSuccess event
   * - INSTANT: setPeerDisconnected() on PeerDisconnect event
   * - PERIODIC: mergeFromBackend() via GetSessions polling
   */
  private connectedPeers = new Map<bigint, Map<bigint, PeerConnectionInfo>>();

  /**
   * Peers we've initiated connection to (waiting for PeerConnectSuccess)
   */
  private pendingConnections = new Set<bigint>();

  /**
   * Connection retry tracking per peer
   */
  private connectionAttempts = new Map<bigint, ConnectionAttempt>();

  /**
   * Online status cache
   */
  private onlinePeers = new Set<bigint>();
  private lastOnlineStatusRefresh = 0;

  /**
   * Force initiator mode - set after ClaimSession to bypass deterministic CID check.
   */
  private _forceInitiatorMode = false;

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

    // CRITICAL: Ensure CIDs are actually BigInt
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    debugLog('State', 
      `[ILM-DIAG] setPeerConnectedLocal: INPUT localCid type=${typeof localCid}, peerCid type=${typeof peerCid}`
    );

    // Store forward direction: localCid → peerCid
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

    // Store reverse direction: peerCid → localCid (BIDIRECTIONAL)
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
    debugLog('State', 
      `[ILM-DIAG] setPeerConnectedLocal: STORED BIDIRECTIONAL localCid=${localCidBigInt.toString()} ↔ peerCid=${peerCidBigInt.toString()} (local peers: ${localPeerMap.size}, peer peers: ${peerPeerMap.size})`
    );
    debugLog('State', 
      `[ILM-DIAG] setPeerConnectedLocal: ALL MAP KEYS (${allKeys.length}): ${allKeys.map((k) => `${k.toString().slice(0, 8)}...(type=${typeof k})`).join(', ')}`
    );
  }

  /**
   * Remove a peer from the connected state (bidirectional).
   * CRITICAL: Ensures CIDs are converted to BigInt for Map operations.
   */
  setPeerDisconnected(localCid: bigint, peerCid: bigint): void {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    // Remove forward direction: localCid → peerCid
    const localPeerMap = this.connectedPeers.get(localCidBigInt);
    if (localPeerMap) {
      localPeerMap.delete(peerCidBigInt);
    }

    // Remove reverse direction: peerCid → localCid
    const peerPeerMap = this.connectedPeers.get(peerCidBigInt);
    if (peerPeerMap) {
      peerPeerMap.delete(localCidBigInt);
    }

    debugLog('State', 
      `[P2PAutoConnect] setPeerDisconnected: ${localCidBigInt.toString().slice(0, 8)} -X- ${peerCidBigInt.toString().slice(0, 8)} (BIDIRECTIONAL)`
    );
  }

  /**
   * Get peer CIDs for a session. Called by WASM ILM via JavaScript callback.
   */
  getPeersForSession(localCid: bigint): bigint[] {
    const localCidBigInt = ensureBigInt(localCid);

    const peerMap = this.connectedPeers.get(localCidBigInt);
    if (!peerMap) {
      const allCids = Array.from(this.connectedPeers.keys());
      if (allCids.length > 0) {
        debugLog('P2PAutoConnectState',
          `getPeersForSession: NO ENTRY for CID ${localCidBigInt.toString().slice(0, 8)}... (type=${typeof localCid}→${typeof localCidBigInt}), but connectedPeers has entries for: ${allCids.map((c) => `${c.toString().slice(0, 8)}(type=${typeof c})`).join(', ')}`
        );
      }
      return [];
    }
    return Array.from(peerMap.keys());
  }

  /**
   * Check if a peer is connected for a session.
   */
  isPeerConnectedForSession(localCid: bigint, peerCid: bigint): boolean {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);
    const peerMap = this.connectedPeers.get(localCidBigInt);
    return peerMap?.has(peerCidBigInt) ?? false;
  }

  /**
   * Get connection info for a specific peer.
   */
  getPeerConnectionInfo(localCid: bigint, peerCid: bigint): PeerConnectionInfo | null {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);
    const peerMap = this.connectedPeers.get(localCidBigInt);
    return peerMap?.get(peerCidBigInt) ?? null;
  }

  /**
   * Get the peer map for a local CID (for backend merge operations).
   */
  getPeerMapForSession(localCid: bigint): Map<bigint, PeerConnectionInfo> {
    const localCidBigInt = ensureBigInt(localCid);
    if (!this.connectedPeers.has(localCidBigInt)) {
      this.connectedPeers.set(localCidBigInt, new Map());
    }
    return this.connectedPeers.get(localCidBigInt)!;
  }

  /**
   * Clear all connected peers for a local CID.
   */
  clearConnectedPeers(localCid: bigint): void {
    const localCidBigInt = ensureBigInt(localCid);
    this.connectedPeers.set(localCidBigInt, new Map());
  }

  // ============================================================================
  // Pending Connections Management
  // ============================================================================

  hasPendingConnection(peerCid: bigint): boolean {
    return this.pendingConnections.has(peerCid);
  }

  addPendingConnection(peerCid: bigint): void {
    this.pendingConnections.add(peerCid);
  }

  removePendingConnection(peerCid: bigint): void {
    this.pendingConnections.delete(peerCid);
  }

  clearPendingConnections(): void {
    this.pendingConnections.clear();
  }

  get pendingConnectionCount(): number {
    return this.pendingConnections.size;
  }

  // ============================================================================
  // Connection Attempts Management
  // ============================================================================

  getConnectionAttempt(peerCid: bigint): ConnectionAttempt | undefined {
    return this.connectionAttempts.get(peerCid);
  }

  setConnectionAttempt(peerCid: bigint, attempt: ConnectionAttempt): void {
    this.connectionAttempts.set(peerCid, attempt);
  }

  deleteConnectionAttempt(peerCid: bigint): void {
    const attempt = this.connectionAttempts.get(peerCid);
    if (attempt?.timeout) {
      clearTimeout(attempt.timeout);
    }
    this.connectionAttempts.delete(peerCid);
  }

  clearAllConnectionAttempts(): void {
    for (const [, attempt] of this.connectionAttempts) {
      if (attempt.timeout) {
        clearTimeout(attempt.timeout);
      }
    }
    this.connectionAttempts.clear();
  }

  hasConnectionAttempt(peerCid: bigint): boolean {
    return this.connectionAttempts.has(peerCid);
  }

  // ============================================================================
  // Online Status Management
  // ============================================================================

  isPeerOnline(peerCid: bigint): boolean {
    return this.onlinePeers.has(peerCid);
  }

  setOnlinePeers(peerCids: bigint[]): void {
    this.onlinePeers.clear();
    for (const cid of peerCids) {
      this.onlinePeers.add(cid);
    }
    this.lastOnlineStatusRefresh = Date.now();
  }

  getOnlinePeers(): bigint[] {
    return Array.from(this.onlinePeers);
  }

  get onlinePeerCount(): number {
    return this.onlinePeers.size;
  }

  get onlineStatusAge(): number {
    return Date.now() - this.lastOnlineStatusRefresh;
  }

  // ============================================================================
  // Force Initiator Mode
  // ============================================================================

  get forceInitiatorMode(): boolean {
    return this._forceInitiatorMode;
  }

  set forceInitiatorMode(value: boolean) {
    this._forceInitiatorMode = value;
    debugLog('State', `P2PAutoConnect: forceInitiatorMode=${value}`);
  }
}
