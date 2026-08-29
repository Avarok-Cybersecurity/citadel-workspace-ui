/**
 * P2P Connection Tracking State
 *
 * Pending connections, connection attempts, online status, and force initiator mode.
 * Extends ConnectedPeersState with tracking capabilities.
 */

import type { ConnectionAttempt } from './types';
import { ConnectedPeersState } from './connected-peers';
import { debugLog } from '@/lib/debug-config';

export class P2PConnectionState extends ConnectedPeersState {
  /**
   * Peers we've initiated connection to (waiting for PeerConnectSuccess)
   */
  private pendingConnections: Set<bigint> = new Set<bigint>();

  /**
   * Connection retry tracking per peer
   */
  private connectionAttempts: Map<bigint, ConnectionAttempt> = new Map<bigint, ConnectionAttempt>();

  /**
   * Online status cache
   */
  private onlinePeers: Set<bigint> = new Set<bigint>();
  private lastOnlineStatusRefresh: number = 0;

  /**
   * Force initiator mode - set after ClaimSession to bypass deterministic CID check.
   */
  private _forceInitiatorMode: boolean = false;

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
    const attempt: ConnectionAttempt | undefined = this.connectionAttempts.get(peerCid);
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
    debugLog('P2PAutoConnectState', `P2PAutoConnect: forceInitiatorMode=${value}`);
  }
}
