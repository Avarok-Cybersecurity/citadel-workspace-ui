/**
 * P2P Auto-Connect Service State
 *
 * Connection state tracking: connectedPeers Map, online peers, ready channels,
 * pending connections, and connection attempts. This is the single source of truth
 * for peer connection state in the frontend.
 *
 * Delegates to P2PConnectionState from p2p-auto-connect module for core Map operations,
 * and adds service-level state (ready channels, online status refresh, force initiator).
 */

import { P2PConnectionState } from '../p2p-auto-connect/tracking';
import type { PeerConnectionInfo } from './types';

/**
 * Encapsulates all mutable state for the P2PAutoConnectService.
 * The service class holds one instance and passes it to standalone functions.
 */
export class AutoConnectState {
  /** Core connection state (SSOT for connectedPeers, pending, attempts, online) */
  readonly core: P2PConnectionState = new P2PConnectionState();

  /**
   * Channels that have proven bidirectional message flow.
   * A channel is "ready" when we receive the first P2P message from the peer,
   * proving the channel is established and messages can flow in both directions.
   * Reset on session reconnection (ClaimSession/Login).
   */
  readonly readyChannels: Set<bigint> = new Set<bigint>();

  /** Periodic polling interval handle for connection attempts */
  pollingInterval: NodeJS.Timeout | null = null;

  /** Periodic polling interval handle for GetSessions (backend state sync) */
  backendPollInterval: NodeJS.Timeout | null = null;

  /** Guard to prevent concurrent refresh operations */
  isRefreshing: boolean = false;

  // ----- Delegating accessors for common core operations -----

  setPeerConnectedLocal(
    localCid: bigint,
    peerCid: bigint,
    peerUsername: string = '',
    localUsername: string = ''
  ): void {
    this.core.setPeerConnectedLocal(localCid, peerCid, peerUsername, localUsername);
  }

  setPeerDisconnected(localCid: bigint, peerCid: bigint): void {
    this.core.setPeerDisconnected(localCid, peerCid);
  }

  getPeersForSession(localCid: bigint): bigint[] {
    return this.core.getPeersForSession(localCid);
  }

  isPeerConnectedForSession(localCid: bigint, peerCid: bigint): boolean {
    return this.core.isPeerConnectedForSession(localCid, peerCid);
  }

  getPeerConnectionInfo(localCid: bigint, peerCid: bigint): PeerConnectionInfo | null {
    return this.core.getPeerConnectionInfo(localCid, peerCid);
  }

  isPeerOnline(peerCid: bigint): boolean {
    return this.core.isPeerOnline(peerCid);
  }

  addOnlinePeer(peerCid: bigint): void {
    // Directly add a single peer to the online set (used by event handlers)
    // This leverages setOnlinePeers internally by building the full list
    const current: bigint[] = this.core.getOnlinePeers();
    if (!current.includes(peerCid)) {
      current.push(peerCid);
      this.core.setOnlinePeers(current);
    }
  }

  getOnlinePeers(): bigint[] {
    return this.core.getOnlinePeers();
  }

  get forceInitiatorMode(): boolean {
    return this.core.forceInitiatorMode;
  }

  set forceInitiatorMode(value: boolean) {
    this.core.forceInitiatorMode = value;
  }

  get onlineStatusAge(): number {
    return this.core.onlineStatusAge;
  }

  hasPendingConnection(peerCid: bigint): boolean {
    return this.core.hasPendingConnection(peerCid);
  }

  addPendingConnection(peerCid: bigint): void {
    this.core.addPendingConnection(peerCid);
  }

  removePendingConnection(peerCid: bigint): void {
    this.core.removePendingConnection(peerCid);
  }

  clearPendingConnections(): void {
    this.core.clearPendingConnections();
  }

  get pendingConnectionCount(): number {
    return this.core.pendingConnectionCount;
  }

  cancelRetry(peerCid: bigint): void {
    this.core.deleteConnectionAttempt(peerCid);
  }

  cancelAllRetries(): void {
    this.core.clearAllConnectionAttempts();
  }

  getConnectionAttempt(peerCid: bigint) {
    return this.core.getConnectionAttempt(peerCid);
  }

  setConnectionAttempt(peerCid: bigint, attempt: { attempts: number; timeout: NodeJS.Timeout | null }): void {
    this.core.setConnectionAttempt(peerCid, attempt);
  }

  hasConnectionAttempt(peerCid: bigint): boolean {
    return this.core.hasConnectionAttempt(peerCid);
  }

  clearConnectedPeers(localCid: bigint): void {
    this.core.clearConnectedPeers(localCid);
  }

  setOnlinePeers(peerCids: bigint[]): void {
    this.core.setOnlinePeers(peerCids);
  }

  clearOnlineStatus(): void {
    this.core.setOnlinePeers([]);
  }

  getPeerMapForSession(localCid: bigint): Map<bigint, PeerConnectionInfo> {
    return this.core.getPeerMapForSession(localCid);
  }
}
