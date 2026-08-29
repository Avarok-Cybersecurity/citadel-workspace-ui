/**
 * P2P Registration Service - Main Orchestrator
 *
 * Thin class that owns shared state and delegates to module functions.
 * Preserves the singleton pattern and public API surface.
 *
 * CID LIFECYCLE: CID is PERMANENT per account. Once assigned during C2S
 * registration, it NEVER changes. Login/ClaimSession preserve the same CID.
 * P2P registrations persist by CID pairs across sessions.
 * "Peer already registered" is NOT an error - expected after reconnect.
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from '../multi-instance';
import { connectionManager } from '../connection';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { narrowWebSocketMessage } from '@/lib/ws-message-boundary';
import type { BroadcastStateSyncData } from '@/types/ws-message-types';
import { debugLog } from '@/lib/debug-config';
import type { Peer, PeerInfoResponse, PeerRegistrationOptions, PendingRequestEntry } from './types';
import { POLLING_INTERVAL } from './constants';
import {
  listAllPeers as doListAllPeers,
  listRegisteredPeers as doListRegisteredPeers,
  updatePeerMaps,
} from './discovery';
import {
  handleWebSocketMessage as routeMessage,
  registerPeer as doRegisterPeer,
  registerUnregisteredPeers as doRegisterUnregisteredPeers,
} from './registration';
import {
  listRegisteredPeersWithRetry as doListRegisteredPeersWithRetry,
  syncPeerConnectionsFromSession as doSyncPeerConnections,
  getAutoAcceptSetting as doGetAutoAcceptSetting,
  setAutoAcceptSetting as doSetAutoAcceptSetting,
  handleIncomingRegistrationWithCid as doHandleIncomingRegistration,
  acceptRegistrationRequest as doAcceptRegistration,
  declineRegistrationRequest as doDeclineRegistration,
} from './connection';

export class P2PRegistrationService {
  private static instance: P2PRegistrationService;
  private isRunning = false;
  private registeredPeers: Map<bigint, Peer> = new Map<bigint, Peer>();
  private allPeers: Map<bigint, Peer> = new Map<bigint, Peer>();
  private pollingInterval: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, PendingRequestEntry> = new Map<string, PendingRequestEntry>();
  private outgoingRegistrations: Set<bigint> = new Set<bigint>();
  private incomingRegistrations: Set<bigint> = new Set<bigint>();
  private isCheckingPeers = false;
  /** The options start() was called with, replayed on every reconnect re-sync. */
  private startOptions: PeerRegistrationOptions = {};

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): P2PRegistrationService {
    if (!P2PRegistrationService.instance) {
      P2PRegistrationService.instance = new P2PRegistrationService();
    }
    return P2PRegistrationService.instance;
  }

  private setupEventListeners(): void {
    eventEmitter.on('websocket-message', (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      routeMessage(message, {
        pendingRequests: this.pendingRequests,
        allPeers: this.allPeers,
        registeredPeers: this.registeredPeers,
        outgoingRegistrations: this.outgoingRegistrations,
        incomingRegistrations: this.incomingRegistrations,
        handleIncomingRegistration: (notificationCid, peerCid, peerUsername) =>
          doHandleIncomingRegistration(notificationCid, peerCid, peerUsername, this.pendingRequests),
      });
    });

    // Re-sync as soon as the socket is back instead of waiting out the 30s
    // poll. This listened for 'connection:status-changed', which nothing emits,
    // so the immediate re-sync never ran. Replays start()'s options, because
    // re-checking without them would silently drop autoRegisterAll.
    eventEmitter.on('on-ws-connection-success', async () => {
      if (!this.isRunning) return;
      await this.checkAndRegisterPeers(this.startOptions);
    });

    eventEmitter.on('broadcast-state-sync', (raw: unknown) => {
      const data: BroadcastStateSyncData = raw as BroadcastStateSyncData;
      if (data?.type === 'registered-peer-update' && !instanceManager.isLeader) {
        const peerCid = data.peerCid as string | undefined;
        const peerUsername = data.peerUsername as string | undefined;
        const isOutgoing = data.isOutgoing as boolean | undefined;
        const isIncoming = data.isIncoming as boolean | undefined;
        if (peerCid !== undefined) {
          const peerCidBigInt: bigint = BigInt(peerCid);
          debugLog('P2PRegistrationService', `[P2P-SYNC] Follower received registeredPeers update: ${peerCidBigInt.toString().slice(0, 8)}... (${peerUsername ?? ''})`);
          this.setPeerRegisteredLocal(peerCidBigInt, peerUsername || '', isOutgoing, isIncoming);
          const peer: Peer = {
            cid: peerCidBigInt,
            username: peerUsername || `User ${peerCidBigInt.toString().slice(0, 8)}`,
            fullName: peerUsername || `User ${peerCidBigInt.toString().slice(0, 8)}`,
            isOnline: true,
            isRegistered: true
          };
          eventEmitter.emit('p2p:peer-registered', { peer, isOutgoing, isIncoming, fromBroadcast: true });
        }
      }
    });
  }

  private setPeerRegisteredLocal(peerCid: bigint, peerUsername: string, isOutgoing?: boolean, isIncoming?: boolean): void {
    const peer: Peer = this.allPeers.get(peerCid) || {
      cid: peerCid,
      username: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      fullName: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      isOnline: true,
      isRegistered: true
    };
    peer.isRegistered = true;
    if (peerUsername && peerUsername !== 'Unknown' && !peerUsername.startsWith('User ')) {
      peer.username = peerUsername;
      peer.fullName = peerUsername;
    }
    this.registeredPeers.set(peerCid, peer);
    if (!this.allPeers.has(peerCid)) {
      this.allPeers.set(peerCid, peer);
    }
    if (isOutgoing) this.outgoingRegistrations.add(peerCid);
    if (isIncoming) this.incomingRegistrations.add(peerCid);
  }

  // ---- Public API (delegates to module functions) ----

  public async start(options: PeerRegistrationOptions = {}): Promise<void> {
    if (this.isRunning) {
      debugLog('P2PRegistrationService', 'P2P Registration Service already running');
      return;
    }
    const connectionInfo = connectionManager.getConnectionInfo();
    if (!connectionInfo?.cid) {
      throw new Error('No active connection. Please connect first.');
    }
    this.isRunning = true;
    this.startOptions = options;
    debugLog('P2PRegistrationService', 'Starting P2P Registration Service');
    await this.checkAndRegisterPeers(options);
    this.pollingInterval = setInterval(() => {
      runAsyncSetup(async () => { await this.checkAndRegisterPeers(options); });
    }, POLLING_INTERVAL);
    eventEmitter.emit('p2p:registration-service-started');
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    debugLog('P2PRegistrationService', 'Stopped P2P Registration Service');
    eventEmitter.emit('p2p:registration-service-stopped');
  }

  private async checkAndRegisterPeers(options: PeerRegistrationOptions = {}): Promise<void> {
    if (this.isCheckingPeers) {
      debugLog('P2PRegistrationService', '[P2P] Skipping peer check - previous check still in progress');
      return;
    }
    this.isCheckingPeers = true;
    try {
      const allPeers: PeerInfoResponse[] = await doListAllPeers(this.pendingRequests);
      const registeredPeers: PeerInfoResponse[] = await doListRegisteredPeersWithRetry(this.pendingRequests);
      updatePeerMaps(this.allPeers, this.registeredPeers, allPeers, registeredPeers);
      if (options.autoRegisterAll) {
        await doRegisterUnregisteredPeers(this.allPeers, options, this.pendingRequests);
      }
      eventEmitter.emit('p2p:peers-updated', {
        allPeers: Array.from(this.allPeers.values()),
        registeredPeers: Array.from(this.registeredPeers.values())
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      if (errorMessage?.includes('CID 0') || errorMessage?.includes('No active')) return;
      debugLog('P2PRegistrationService', 'Error checking and registering peers:', error);
    } finally {
      this.isCheckingPeers = false;
    }
  }

  public async listAllPeers(): Promise<PeerInfoResponse[]> {
    return doListAllPeers(this.pendingRequests);
  }

  public async listRegisteredPeersWithRetry(maxRetries = 2): Promise<PeerInfoResponse[]> {
    return doListRegisteredPeersWithRetry(this.pendingRequests, maxRetries);
  }

  public async listRegisteredPeers(): Promise<PeerInfoResponse[]> {
    return doListRegisteredPeers(this.pendingRequests);
  }

  public async registerPeer(peerCid: bigint, options: PeerRegistrationOptions = {}): Promise<void> {
    return doRegisterPeer(peerCid, options, this.pendingRequests);
  }

  public getPeers(): { allPeers: Peer[]; registeredPeers: Peer[] } {
    return {
      allPeers: Array.from(this.allPeers.values()),
      registeredPeers: Array.from(this.registeredPeers.values())
    };
  }

  public isPeerRegistered(peerCid: bigint): boolean {
    return this.registeredPeers.has(peerCid);
  }

  public hasOutgoingRegistration(peerCid: bigint): boolean {
    return this.outgoingRegistrations.has(peerCid);
  }

  public getPeerInfo(peerCid: bigint): Peer | undefined {
    return this.allPeers.get(peerCid);
  }

  public async syncPeerConnectionsFromSession(
    peerConnections: Record<string, { cid: bigint; peer_cid: bigint; peer_username: string }> | undefined
  ): Promise<void> {
    return doSyncPeerConnections(peerConnections, this.allPeers, this.registeredPeers, this.pendingRequests);
  }

  public async getAutoAcceptSetting(cidOverride?: bigint): Promise<boolean> {
    return doGetAutoAcceptSetting(cidOverride);
  }

  public async setAutoAcceptSetting(autoAccept: boolean): Promise<void> {
    return doSetAutoAcceptSetting(autoAccept);
  }

  public async acceptRegistrationRequest(peerCid: bigint, peerUsername?: string): Promise<void> {
    return doAcceptRegistration(peerCid, peerUsername, this.pendingRequests, this.registeredPeers);
  }

  public async declineRegistrationRequest(peerCid: bigint): Promise<void> {
    return doDeclineRegistration(peerCid);
  }
}
