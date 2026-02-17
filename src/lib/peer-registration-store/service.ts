/**
 * Peer Registration Store - Service (Orchestrator)
 *
 * Thin class that wires together state, persistence, lifecycle, and event-handler modules.
 * Preserves the original public API surface and singleton pattern.
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from '../multi-instance';
import { debugLog } from '@/lib/debug-config';
import { OUTGOING_POLL_INTERVAL_MS } from './constants';
import type {
  PendingPeerRequest,
  OutgoingPeerRequest,
  KVPendingEntry,
  PeerRegisterNotification,
} from './types';
import {
  getCurrentSessionCid,
  getFilteredPendingRequests,
  getFilteredPendingCount,
  hasRequestFromPeer as hasRequestFromPeerFn,
  hasOutgoingRequestTo as hasOutgoingRequestToFn,
  getFilteredOutgoingRequests,
  getOutgoingRequestCidSet,
  removePendingById,
  removePendingByPeerCid,
  removeOutgoingById,
  removeOutgoingByPeerCid,
} from './state';
import {
  persistPendingToLocalDB,
  loadPendingFromLocalDB,
  persistOutgoingToLocalDB,
  loadOutgoingFromLocalDB,
} from './persistence';
import {
  createNotificationWithCallbacks,
  processIncomingNotification,
  executeAcceptRequest,
  processPollRequest,
} from './lifecycle';
import { setupEventListeners } from './event-handlers';

class PeerRegistrationStore {
  private static instance: PeerRegistrationStore;
  private pendingRequests: PendingPeerRequest[] = [];
  private outgoingRequests: OutgoingPeerRequest[] = [];
  private pendingKVRequests = new Map<string, KVPendingEntry>();
  private isInitializedFlag = false;
  private initializationPromise: Promise<void> | null = null;
  private pollIntervalId: NodeJS.Timeout | null = null;

  private constructor() {
    setupEventListeners({
      refreshNotificationsForCurrentSession: () => this.refreshNotificationsForCurrentSession(),
      startPollLoop: () => this.startPollLoop(),
      stopPollLoop: () => this.stopPollLoop(),
      removeOutgoingRequestByPeer: (cid) => this.removeOutgoingRequestByPeer(cid),
      removeRequestByPeerCid: (cid) => this.removeRequestByPeerCid(cid),
      isInitialized: () => this.isInitializedFlag,
      getPendingKVRequests: () => this.pendingKVRequests,
    });
  }

  public static getInstance(): PeerRegistrationStore {
    if (!PeerRegistrationStore.instance) {
      PeerRegistrationStore.instance = new PeerRegistrationStore();
    }
    return PeerRegistrationStore.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitializedFlag) return;
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      await Promise.all([this.loadFromLocalDB(), this.loadOutgoingFromLocalDB()]);
      this.startPollLoop();
    })();
    await this.initializationPromise;
    this.isInitializedFlag = true;
    this.initializationPromise = null;
  }

  public startPollLoop(): void {
    if (!instanceManager.isLeader) { debugLog('PeerRegistrationStore', 'Poll loop not started (not leader tab)'); return; }
    if (this.pollIntervalId) { debugLog('PeerRegistrationStore', 'Poll loop already running'); return; }
    debugLog('PeerRegistrationStore', 'Starting poll loop (interval:', OUTGOING_POLL_INTERVAL_MS, 'ms)');
    this.pollIntervalId = setInterval(() => {
      this.pollAndResend().catch(err => debugLog('PeerRegistrationStore', 'Poll loop error:', err));
    }, OUTGOING_POLL_INTERVAL_MS);
  }

  public stopPollLoop(): void {
    if (this.pollIntervalId) { clearInterval(this.pollIntervalId); this.pollIntervalId = null; debugLog('PeerRegistrationStore', 'Stopped poll loop'); }
  }

  public async getPendingRequests(): Promise<PendingPeerRequest[]> { return getFilteredPendingRequests(this.pendingRequests); }
  public async getPendingCount(): Promise<number> { return getFilteredPendingCount(this.pendingRequests); }
  public hasRequestFromPeer(peerCid: bigint, targetCid?: bigint): boolean { return hasRequestFromPeerFn(this.pendingRequests, peerCid, targetCid); }
  public hasOutgoingRequestTo(peerCid: bigint, fromCid?: bigint): boolean { return hasOutgoingRequestToFn(this.outgoingRequests, peerCid, fromCid); }
  public async getOutgoingRequests(): Promise<OutgoingPeerRequest[]> { return getFilteredOutgoingRequests(this.outgoingRequests); }
  public async getOutgoingRequestCids(): Promise<Set<bigint>> { return getOutgoingRequestCidSet(this.outgoingRequests); }

  public async addOutgoingRequest(request: OutgoingPeerRequest): Promise<void> {
    if (!request.toCid) { debugLog('PeerRegistrationStore', 'Cannot add outgoing request without toCid'); return; }
    if (!request.fromCid) { debugLog('PeerRegistrationStore', 'Cannot add outgoing request without fromCid'); return; }
    if (this.hasOutgoingRequestTo(request.toCid, request.fromCid)) { debugLog('PeerRegistrationStore', 'Duplicate outgoing request to', request.toCid); return; }
    if (!request.timeLastSent) request.timeLastSent = request.timestamp || Date.now();
    this.outgoingRequests.push(request);
    debugLog('PeerRegistrationStore', 'Added outgoing request', request);
    await persistOutgoingToLocalDB(this.outgoingRequests, this.pendingKVRequests);
    await this.emitOutgoingUpdate();
  }

  public async removeOutgoingRequest(requestId: string): Promise<void> {
    const before = this.outgoingRequests.length;
    this.outgoingRequests = removeOutgoingById(this.outgoingRequests, requestId);
    if (this.outgoingRequests.length !== before) {
      debugLog('PeerRegistrationStore', 'Removed outgoing request', requestId);
      await persistOutgoingToLocalDB(this.outgoingRequests, this.pendingKVRequests);
      await this.emitOutgoingUpdate();
    }
  }

  public async removeOutgoingRequestByPeer(peerCid: bigint, fromCid?: bigint): Promise<void> {
    const before = this.outgoingRequests.length;
    this.outgoingRequests = removeOutgoingByPeerCid(this.outgoingRequests, peerCid, fromCid);
    if (this.outgoingRequests.length !== before) {
      debugLog('PeerRegistrationStore', 'Removed outgoing request to peer', peerCid.toString());
      await persistOutgoingToLocalDB(this.outgoingRequests, this.pendingKVRequests);
      await this.emitOutgoingUpdate();
    }
  }

  public async handleIncomingRequest(notification: PeerRegisterNotification): Promise<void> {
    const request = processIncomingNotification(this.pendingRequests, notification);
    if (!request) return;
    this.pendingRequests.push(request);
    debugLog('PeerRegistrationStore', '[P2P] Added pending request', request);
    await persistPendingToLocalDB(this.pendingRequests, this.pendingKVRequests);
    const currentCid = await getCurrentSessionCid();
    if (currentCid === request.cid) this.createNotificationForRequest(request);
    await this.emitUpdate();
  }

  public async acceptRequest(requestId: string): Promise<void> {
    const request = this.pendingRequests.find(r => r.id === requestId);
    if (!request) throw new Error('Request not found');
    await executeAcceptRequest(request);
    await this.removeRequest(requestId);
    debugLog('PeerRegistrationStore', 'Accepted request from', request.peer_username);
  }

  public async declineRequest(requestId: string): Promise<void> {
    const request = this.pendingRequests.find(r => r.id === requestId);
    if (!request) throw new Error('Request not found');
    await this.removeRequest(requestId);
    debugLog('PeerRegistrationStore', 'Declined request from', request.peer_username);
  }

  public async removeRequestByPeerCid(peerCid: bigint): Promise<void> {
    const before = this.pendingRequests.length;
    this.pendingRequests = removePendingByPeerCid(this.pendingRequests, peerCid);
    if (this.pendingRequests.length !== before) {
      debugLog('PeerRegistrationStore', 'Removed requests from peer', peerCid.toString());
      await persistPendingToLocalDB(this.pendingRequests, this.pendingKVRequests);
      await this.emitUpdate();
    }
  }

  public async refreshNotificationsForCurrentSession(): Promise<void> {
    const requests = await this.getPendingRequests();
    for (const r of requests) this.createNotificationForRequest(r);
    await this.emitUpdate();
  }

  private createNotificationForRequest(request: PendingPeerRequest): void {
    createNotificationWithCallbacks(
      request,
      (id) => this.acceptRequest(id).catch((err: unknown) => debugLog('PeerRegistrationStore', 'accept failed:', err)),
      (id) => this.declineRequest(id).catch((err: unknown) => debugLog('PeerRegistrationStore', 'decline failed:', err)),
    );
  }

  private async removeRequest(requestId: string): Promise<void> {
    this.pendingRequests = removePendingById(this.pendingRequests, requestId);
    await persistPendingToLocalDB(this.pendingRequests, this.pendingKVRequests);
    await this.emitUpdate();
  }

  private async pollAndResend(): Promise<void> {
    if (!instanceManager.isLeader) return;
    await this.loadOutgoingFromLocalDB();
    const now = Date.now();
    if (this.outgoingRequests.length === 0) return;
    debugLog('PeerRegistrationStore', 'Poll checking', this.outgoingRequests.length, 'outgoing requests');
    let needsPersist = false;
    for (const request of this.outgoingRequests) {
      const result = await processPollRequest(request, now);
      if (result === 'remove') { await this.removeOutgoingRequest(request.id); needsPersist = true; }
      else if (result === 'updated') { needsPersist = true; }
    }
    if (needsPersist) await persistOutgoingToLocalDB(this.outgoingRequests, this.pendingKVRequests);
  }

  private async loadFromLocalDB(): Promise<void> {
    await loadPendingFromLocalDB(this.pendingKVRequests, async (requests) => {
      this.pendingRequests = requests;
      debugLog('PeerRegistrationStore', 'Loaded', requests.length, 'pending requests');
      const current = await this.getPendingRequests();
      for (const r of current) this.createNotificationForRequest(r);
      await this.emitUpdate();
    });
  }

  private async loadOutgoingFromLocalDB(): Promise<void> {
    await loadOutgoingFromLocalDB(this.pendingKVRequests, async (requests) => {
      this.outgoingRequests = requests;
      debugLog('PeerRegistrationStore', 'Loaded', requests.length, 'valid outgoing requests');
      await this.emitOutgoingUpdate();
    });
  }

  private async emitUpdate(): Promise<void> {
    const currentCid = await getCurrentSessionCid();
    const currentSessionRequests = await this.getPendingRequests();
    debugLog('PeerRegistrationStore', `[P2P] emitUpdate: currentCid=${currentCid?.toString()}, total=${this.pendingRequests.length}, filtered=${currentSessionRequests.length}`);
    eventEmitter.emit('peer-requests:updated', { requests: currentSessionRequests, count: currentSessionRequests.length });
  }

  private async emitOutgoingUpdate(): Promise<void> {
    const out = await this.getOutgoingRequests();
    eventEmitter.emit('outgoing-peer-requests:updated', { requests: out, cids: new Set(out.map(r => r.toCid)) });
  }
}

export const peerRegistrationStore = PeerRegistrationStore.getInstance();
export { PeerRegistrationStore };
