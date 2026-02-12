/**
 * Peer Registration Store
 *
 * Manages pending peer registration requests with LocalDB persistence.
 * Provides non-disruptive UX - stores requests for later review via sidebar badge.
 */

import { eventEmitter } from './event-emitter';
import { websocketService } from './websocket-service';
import { connectionManager } from './connection';
import { instanceManager } from './multi-instance';
import { notificationService } from './notification-service';
import { p2pAutoConnectService } from './p2p-auto-connect-service';
import { p2pRegistrationService } from './p2p-registration-service';
import { getSelectedUser } from './tab-context';
import { getDefaultSecuritySettings } from './security-utils';
import type { InternalServiceRequest } from 'citadel-workspace-client-ts';
import { stringToBytes, bytesToString } from './utils/encoding-utils';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export interface PendingPeerRequest {
  id: string;              // UUID for this request
  peer_cid: bigint;        // CID of the requesting peer
  peer_username: string;   // Username of the requesting peer
  timestamp: number;       // When request was received
  cid: bigint;             // Recipient's CID (our CID)
}

/**
 * Outgoing peer registration request - tracks requests we've sent
 * that are awaiting response (peer may be offline for hours/days)
 */
export interface OutgoingPeerRequest {
  id: string;              // UUID for this request (matches request_id sent to server)
  fromCid: bigint;         // Our CID (the requester)
  toCid: bigint;           // Target peer's CID
  peerUsername: string;    // Target peer's username (for display)
  timestamp: number;       // When request was originally sent
  timeLastSent: number;    // When request was last (re)sent - for poll loop
}

const STORAGE_KEY = 'pending_peer_requests';
const OUTGOING_STORAGE_KEY = 'outgoing_peer_requests';
const REQUEST_TIMEOUT_MS = 5000;
// Outgoing request poll loop - default 5m, but 30s for testing
const OUTGOING_POLL_INTERVAL_MS = 5 * 60 * 1000;
// How long since last send before we resend (matches poll interval)
const OUTGOING_RESEND_THRESHOLD_MS = 5 * 60 * 1000;

class PeerRegistrationStore {
  private static instance: PeerRegistrationStore;
  private pendingRequests: PendingPeerRequest[] = [];
  private outgoingRequests: OutgoingPeerRequest[] = [];
   
  private pendingKVRequests = new Map<string, { resolve: (value?: any) => void; reject: (error: Error) => void }>();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private pollIntervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): PeerRegistrationStore {
    if (!PeerRegistrationStore.instance) {
      PeerRegistrationStore.instance = new PeerRegistrationStore();
    }
    return PeerRegistrationStore.instance;
  }

  /**
   * Initialize the store - load pending and outgoing requests from LocalDB
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      await Promise.all([
        this.loadFromLocalDB(),
        this.loadOutgoingFromLocalDB()
      ]);
      // Start the poll loop for outgoing requests
      this.startPollLoop();
    })();
    await this.initializationPromise;
    this.isInitialized = true;
    this.initializationPromise = null;
  }

  /**
   * Start the poll loop for resending outgoing requests to offline peers.
   * Only runs on leader tab to prevent duplicate registration requests from multiple tabs.
   */
  public startPollLoop(): void {
    // Only leader tab should poll to prevent duplicate registration requests from multiple tabs
    if (!instanceManager.isLeader) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Poll loop not started (not leader tab)');
      return;
    }

    if (this.pollIntervalId) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Poll loop already running');
      return;
    }

    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Starting outgoing request poll loop (interval:', OUTGOING_POLL_INTERVAL_MS, 'ms)');
    this.pollIntervalId = setInterval(() => {
      this.pollAndResend().catch(err => {
        console.error('PeerRegistrationStore: Poll loop error:', err);
      });
    }, OUTGOING_POLL_INTERVAL_MS);
  }

  /**
   * Stop the poll loop
   */
  public stopPollLoop(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Stopped poll loop');
    }
  }

  /**
   * Poll and resend outgoing requests that have exceeded the resend threshold
   * IMPORTANT: Load from LocalDB first for multi-tab synchronization
   *
   * CRITICAL FIX: Checks if peer is already registered before resending.
   * This prevents stale PeerRegister requests from being resent after ClaimSession
   * when peers are already registered (which causes "Ratchet does not exist" errors).
   *
   * Only runs on leader tab to prevent duplicate registration requests from multiple tabs.
   */
  private async pollAndResend(): Promise<void> {
    // Defensive: only leader tab should poll to prevent duplicate registration requests
    if (!instanceManager.isLeader) {
      return;
    }

    // Load latest state from LocalDB before processing (multi-tab sync)
    await this.loadOutgoingFromLocalDB();

    const now = Date.now();
    const requests = this.outgoingRequests;

    if (requests.length === 0) {
      return;
    }

    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Poll checking', requests.length, 'outgoing requests');

    let needsPersist = false;
    const toRemove: string[] = [];

    for (const request of requests) {
      // CRITICAL: Skip and remove if peer is already registered
      // This handles stale requests after ClaimSession/reconnection
      if (p2pRegistrationService.isPeerRegistered(request.toCid)) {
        debugLog('PeerRegistrationStore', `PeerRegistrationStore: Removing stale request for ${request.peerUsername} (${request.toCid.toString().slice(0, 8)}...) - already registered`);
        toRemove.push(request.id);
        continue;
      }

      // Skip if toCid is invalid (defensive - should be filtered on load)
      if (!request.toCid) {
        console.warn('PeerRegistrationStore: Removing invalid request without toCid');
        toRemove.push(request.id);
        continue;
      }

      const elapsed = now - request.timeLastSent;

      if (elapsed >= OUTGOING_RESEND_THRESHOLD_MS) {
        debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Resending request to', request.peerUsername, '(elapsed:', elapsed, 'ms)');

        try {
          await this.resendPeerRegister(request);
          // Update timeLastSent
          request.timeLastSent = Date.now();
          needsPersist = true;
        } catch (error: unknown) {
          // Handle duplicate request error gracefully - Citadel Protocol may return
          // an error if the request still exists in its queue (hasn't reached TTL)
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('already') || errorMsg.includes('duplicate') || errorMsg.includes('exists')) {
            debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Request already exists in protocol queue, continuing');
            // Still update timeLastSent so we don't spam
            request.timeLastSent = Date.now();
            needsPersist = true;
          } else if (errorMsg.includes('Ratchet does not exist')) {
            // Ratchet error means peer relationship is broken - remove stale request
            console.warn(`PeerRegistrationStore: Ratchet error for ${request.peerUsername}, removing stale request`);
            toRemove.push(request.id);
          } else {
            console.error('PeerRegistrationStore: Failed to resend to', request.peerUsername, ':', errorMsg);
          }
        }
      }
    }

    // Remove all stale/invalid requests
    for (const id of toRemove) {
      await this.removeOutgoingRequest(id);
      needsPersist = true;
    }

    if (needsPersist) {
      await this.persistOutgoingToLocalDB();
    }
  }

  /**
   * Resend a PeerRegister request for an outgoing request
   */
  private async resendPeerRegister(request: OutgoingPeerRequest): Promise<void> {
    const client = websocketService.getClient();
    if (!client) {
      throw new Error('No WebSocket client available');
    }

    // Claim the session first to ensure correct context
    await websocketService.claimSession(request.fromCid);

    const registerRequest = {
      PeerRegister: {
        request_id: request.id,
        cid: request.fromCid,
        peer_cid: request.toCid,
        session_security_settings: getDefaultSecuritySettings(),
        connect_after_register: false,
        peer_session_password: null
      }
    };

    await client.sendDirectToInternalService(registerRequest as unknown as InternalServiceRequest);
    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Resent PeerRegister to', request.peerUsername);
  }

  /**
   * Get current session CID
   * Priority: 1) Tab context selectedCid (set during session switch), 2) StoredSession.cid, 3) Global connection CID
   */
  private async getCurrentSessionCid(): Promise<bigint | null> {
    // CRITICAL: Try synchronous sources first to avoid IndexedDB hangs
    // instanceManager.cid is synchronous and updated when the session connects
    const instanceCid = instanceManager.cid;
    if (instanceCid) {
      return instanceCid;
    }

    // Fallback to connectionInfo (also synchronous)
    const connectionInfo = connectionManager.getConnectionInfo();
    if (connectionInfo?.cid) {
      return connectionInfo.cid;
    }

    // Last resort: async methods (can hang if IndexedDB is in bad state)
    // These are kept for edge cases but should rarely be needed
    const tabSelection = await getSelectedUser();
    const tabSession = await connectionManager.getTabSelectedSession();
    return tabSelection?.selectedCid || tabSession?.cid || null;
  }

  /**
   * Get pending requests for current session (or all if no session)
   */
  public async getPendingRequests(): Promise<PendingPeerRequest[]> {
    const currentCid = await this.getCurrentSessionCid();
    if (!currentCid) {
      return [...this.pendingRequests];
    }
    return this.pendingRequests.filter(r => r.cid === currentCid);
  }

  /**
   * Get count of pending requests for current session
   */
  public async getPendingCount(): Promise<number> {
    const currentCid = await this.getCurrentSessionCid();
    const allCount = this.pendingRequests.length;
    if (!currentCid) {
      debugLog('PeerRegistrationStore', `[P2P] PeerRegistrationStore getPendingCount: no currentCid, returning allCount=${allCount}`);
      return allCount;
    }
    const filteredCount = this.pendingRequests.filter(r => r.cid === currentCid).length;
    debugLog('PeerRegistrationStore', `[P2P] PeerRegistrationStore getPendingCount: currentCid=${currentCid.toString()}, allCount=${allCount}, filteredCount=${filteredCount}`);
    return filteredCount;
  }

  /**
   * Check if a request from a specific peer already exists for a target CID
   */
  public hasRequestFromPeer(peerCid: bigint, targetCid?: bigint): boolean {
    if (targetCid !== undefined) {
      return this.pendingRequests.some(r => r.peer_cid === peerCid && r.cid === targetCid);
    }
    return this.pendingRequests.some(r => r.peer_cid === peerCid);
  }

  // ============== Outgoing Request Methods ==============

  /**
   * Check if we have an outgoing request to a specific peer
   */
  public hasOutgoingRequestTo(peerCid: bigint, fromCid?: bigint): boolean {
    if (fromCid !== undefined) {
      return this.outgoingRequests.some(r => r.toCid === peerCid && r.fromCid === fromCid);
    }
    return this.outgoingRequests.some(r => r.toCid === peerCid);
  }

  /**
   * Get all outgoing requests for current session
   */
  public async getOutgoingRequests(): Promise<OutgoingPeerRequest[]> {
    const currentCid = await this.getCurrentSessionCid();
    if (!currentCid) {
      return [...this.outgoingRequests];
    }
    return this.outgoingRequests.filter(r => r.fromCid === currentCid);
  }

  /**
   * Get outgoing requests as a Set of target CIDs for quick lookup
   */
  public async getOutgoingRequestCids(): Promise<Set<bigint>> {
    const requests = await this.getOutgoingRequests();
    return new Set(requests.map(r => r.toCid));
  }

  /**
   * Add an outgoing request (fire-and-forget - no timeout)
   */
  public async addOutgoingRequest(request: OutgoingPeerRequest): Promise<void> {
    // Validate required fields - toCid is mandatory
    if (!request.toCid) {
      console.error('PeerRegistrationStore: Cannot add outgoing request without toCid');
      return;
    }
    if (!request.fromCid) {
      console.error('PeerRegistrationStore: Cannot add outgoing request without fromCid');
      return;
    }

    // Avoid duplicates
    if (this.hasOutgoingRequestTo(request.toCid, request.fromCid)) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Duplicate outgoing request to', request.toCid);
      return;
    }

    // Ensure timeLastSent is set (for backwards compat and safety)
    if (!request.timeLastSent) {
      request.timeLastSent = request.timestamp || Date.now();
    }

    this.outgoingRequests.push(request);
    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Added outgoing request', request);

    await this.persistOutgoingToLocalDB();
    await this.emitOutgoingUpdate();
  }

  /**
   * Remove an outgoing request by request ID
   */
  public async removeOutgoingRequest(requestId: string): Promise<void> {
    const before = this.outgoingRequests.length;
    this.outgoingRequests = this.outgoingRequests.filter(r => r.id !== requestId);

    if (this.outgoingRequests.length !== before) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Removed outgoing request', requestId);
      await this.persistOutgoingToLocalDB();
      await this.emitOutgoingUpdate();
    }
  }

  /**
   * Remove an outgoing request by peer CID (when registration succeeds/fails)
   */
  public async removeOutgoingRequestByPeer(peerCid: bigint, fromCid?: bigint): Promise<void> {
    const before = this.outgoingRequests.length;
    if (fromCid !== undefined) {
      this.outgoingRequests = this.outgoingRequests.filter(
        r => !(r.toCid === peerCid && r.fromCid === fromCid)
      );
    } else {
      this.outgoingRequests = this.outgoingRequests.filter(r => r.toCid !== peerCid);
    }

    if (this.outgoingRequests.length !== before) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Removed outgoing request to peer', peerCid.toString());
      await this.persistOutgoingToLocalDB();
      await this.emitOutgoingUpdate();
    }
  }

  /**
   * Handle incoming PeerRegisterNotification
   * Stores ALL notifications regardless of current session - filtering happens at display time
   */
  public async handleIncomingRequest(notification: {
    cid: bigint;
    peer_cid: bigint;
    peer_username?: string;
  }): Promise<void> {
    debugLog('PeerRegistrationStore', '[P2P] [PeerRegistrationStore] handleIncomingRequest ENTERED with:', {
      cid: notification.cid?.toString(),
      peer_cid: notification.peer_cid?.toString(),
      peer_username: notification.peer_username
    });
    const peerCid: bigint | undefined = notification.peer_cid;
    const peerUsername = notification.peer_username || 'Unknown';
    const notificationTargetCid: bigint | undefined = notification.cid;

    if (peerCid === undefined) {
      console.warn('PeerRegistrationStore: Invalid notification - missing peer_cid');
      return;
    }

    if (notificationTargetCid === undefined) {
      console.warn('PeerRegistrationStore: Invalid notification - missing target cid');
      return;
    }

    // Ignore notifications where sender = target (shouldn't happen but safety check)
    if (peerCid === notificationTargetCid) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Ignoring self-notification');
      return;
    }

    // Check for duplicate (same peer sending to same target)
    if (this.hasRequestFromPeer(peerCid, notificationTargetCid)) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Duplicate request from peer', peerCid.toString(), 'to', notificationTargetCid.toString());
      return;
    }

    const request: PendingPeerRequest = {
      id: crypto.randomUUID(),
      peer_cid: peerCid,
      peer_username: peerUsername,
      timestamp: (() => {
        const ts = Date.now();
        debugLog('PeerRegistrationStore', `[PeerRegistrationStore] Creating request with timestamp ${ts} (${new Date(ts).toISOString()})`);
        return ts;
      })(),
      cid: notificationTargetCid,
    };

    this.pendingRequests.push(request);
    debugLog('PeerRegistrationStore', '[P2P] PeerRegistrationStore: Added pending request', request);

    // Persist to LocalDB
    await this.persistToLocalDB();

    // Create notification card if this is for the currently viewed session
    const currentCid = await this.getCurrentSessionCid();
    if (currentCid === notificationTargetCid) {
      this.createNotificationForRequest(request);
    }

    // Emit update event
    await this.emitUpdate();
  }

  /**
   * Create a notification card for a pending request
   */
  private createNotificationForRequest(request: PendingPeerRequest): void {
    notificationService.addPeerRegistrationNotification(
      request.peer_username,
      request.peer_cid.toString(),
      request.id,
      () => this.acceptRequest(request.id).catch(console.error),
      () => this.declineRequest(request.id).catch(console.error),
      () => eventEmitter.emit('open-pending-requests-modal'),
      request.cid.toString() // Recipient's CID for per-session notification badges
    );
  }

  /**
   * Refresh notifications for current session
   * Call this when switching sessions to show pending requests for that session
   */
  public async refreshNotificationsForCurrentSession(): Promise<void> {
    const requests = await this.getPendingRequests();
    for (const request of requests) {
      this.createNotificationForRequest(request);
    }
    await this.emitUpdate();
  }

  /**
   * Accept a pending request - registers back with the peer
   */
  public async acceptRequest(requestId: string): Promise<void> {
    const request = this.pendingRequests.find(r => r.id === requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    // Use the stored request.cid (recipient's CID) - this is the correct CID for this session
    // Don't use connectionManager.getConnectionInfo().cid as it may return the leader tab's CID
    // in multi-tab scenarios where this tab is a follower
    const currentCid = request.cid;

    if (!currentCid) {
      throw new Error('No active session - cannot accept registration');
    }

    // Send PeerRegister request back to the peer
    // connect_after_register: false - P2PAutoConnect background service handles connections
    // with deterministic initiator selection (higher CID initiates)
    const registerRequestId = crypto.randomUUID();
    const registerRequest = {
      PeerRegister: {
        request_id: registerRequestId,
        cid: currentCid,
        peer_cid: request.peer_cid,
        session_security_settings: getDefaultSecuritySettings(),
        connect_after_register: false,
        peer_session_password: null
      }
    };

    // Wait for registration response
    // IMPORTANT: Match by request_id OR peer_cid because:
    // 1. Normal case: Backend returns PeerRegisterSuccess/PeerConnectSuccess with matching request_id
    // 2. Simultaneous registration: Backend detects both peers registering simultaneously,
    //    may use a different request_id or send PeerConnectNotification instead
    // NOTE: JavaScript loses precision with large u64 values, so we normalize CIDs for comparison
    const targetPeerCid = request.peer_cid;

    // Normalize CID for comparison - extract last 8 digits to handle JS precision loss
    // e.g., "18017897041159203224" and "18017897041159203000" both become "59203224" and "59203000"
    // This is a workaround for JS number precision issues with u64
    const normalizeCid = (cid: bigint | string | number | null | undefined): string => {
      if (!cid) return '';
      const str = cid.toString();
      // For very long CIDs, compare last 10 chars to avoid precision issues
      return str.length > 10 ? str.slice(-10) : str;
    };

    const targetNormalized = normalizeCid(targetPeerCid);
    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: acceptRequest waiting for response', {
      registerRequestId,
      targetPeerCid,
      targetNormalized
    });

    const responsePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('Registration request timed out'));
      }, 10000);

      const handleMessage = (message: any) => { // any: WebSocket discriminated union with optional chaining
        // Match by request_id (primary)
        const matchesByRequestId =
          message.PeerRegisterSuccess?.request_id === registerRequestId ||
          message.PeerConnectSuccess?.request_id === registerRequestId;

        // Match by peer_cid (fallback for simultaneous registration)
        // Use normalized comparison to handle JS precision loss with large u64 values
        // Check BOTH cid and peer_cid fields - in P2P notifications, either could be the target peer
        const responsePeerCid =
          message.PeerRegisterSuccess?.peer_cid ||
          message.PeerConnectSuccess?.peer_cid ||
          message.PeerConnectNotification?.peer_cid;

        const responseCid =
          message.PeerConnectNotification?.cid;

        const responseNormalized = normalizeCid(responsePeerCid);
        const responseCidNormalized = normalizeCid(responseCid);

        // Match if either peer_cid OR cid equals our target peer
        const matchesByPeerCid = responseNormalized && responseNormalized === targetNormalized;
        const matchesByCid = responseCidNormalized && responseCidNormalized === targetNormalized;

        // Also accept ANY PeerConnectNotification for our session (indicates P2P channel established)
        // This handles the simultaneous registration case where both peers connect
        const isOurNotification = message.PeerConnectNotification &&
          (normalizeCid(message.PeerConnectNotification.cid) === normalizeCid(currentCid) ||
           normalizeCid(message.PeerConnectNotification.peer_cid) === normalizeCid(currentCid));

        // Debug logging for troubleshooting
        if (message.PeerRegisterSuccess || message.PeerConnectSuccess || message.PeerConnectNotification) {
          debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Checking response match', {
            messageType: message.PeerRegisterSuccess ? 'PeerRegisterSuccess' :
                        message.PeerConnectSuccess ? 'PeerConnectSuccess' : 'PeerConnectNotification',
            responsePeerCid,
            responseCid,
            responseNormalized,
            responseCidNormalized,
            targetNormalized,
            currentCidNormalized: normalizeCid(currentCid),
            matchesByRequestId,
            matchesByPeerCid,
            matchesByCid,
            isOurNotification
          });
        }

        if (matchesByRequestId || matchesByPeerCid || matchesByCid || isOurNotification) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Registration succeeded', {
            matchesByRequestId,
            matchesByPeerCid,
            matchesByCid,
            isOurNotification,
            targetPeerCid
          });
          resolve();
        } else if (message.PeerRegisterFailure?.request_id === registerRequestId ||
                   message.PeerConnectFailure?.request_id === registerRequestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          const errorMsg = message.PeerRegisterFailure?.message ||
                          message.PeerConnectFailure?.message ||
                          'Registration failed';
          reject(new Error(errorMsg));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);
    });

    // CRITICAL: Claim the session to ensure the backend processes this request in the correct session context.
    // In multi-tab scenarios, the WebSocket may be associated with a different session (e.g., user2's session).
    // Without claiming first, the backend would use the wrong CID and registration would fail.
    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Claiming session', currentCid, 'before sending PeerRegister');
    await websocketService.claimSession(currentCid);

    // Send the request
    await websocketService.sendMessage(registerRequest);
    await responsePromise;

    // Remove from pending list
    await this.removeRequest(requestId);
    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Accepted request from', request.peer_username);

    // Trigger auto-connect to the newly registered peer
    p2pAutoConnectService.connectToPeer(request.peer_cid).catch((err) => {
      console.warn('PeerRegistrationStore: Auto-connect after accept failed:', err);
    });
  }

  /**
   * Decline a pending request - just removes it
   */
  public async declineRequest(requestId: string): Promise<void> {
    const request = this.pendingRequests.find(r => r.id === requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    await this.removeRequest(requestId);
    debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Declined request from', request.peer_username);
  }

  /**
   * Remove a request by ID
   */
  private async removeRequest(requestId: string): Promise<void> {
    this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
    await this.persistToLocalDB();
    await this.emitUpdate();
  }

  /**
   * Remove all requests from a specific peer CID
   * Used when accepting/declining registration via p2pRegistrationService
   */
  public async removeRequestByPeerCid(peerCid: bigint): Promise<void> {
    const before = this.pendingRequests.length;
    this.pendingRequests = this.pendingRequests.filter(r => r.peer_cid !== peerCid);

    if (this.pendingRequests.length !== before) {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Removed requests from peer', peerCid.toString());
      await this.persistToLocalDB();
      await this.emitUpdate();
    }
  }

  /**
   * Persist pending requests to LocalDB
   */
  private async persistToLocalDB(): Promise<void> {
    const requestId = crypto.randomUUID();
    // Use safeJSONStringify to handle BigInt CID values from WASM
    const { safeJSONStringify } = await import('./storage-utils');
    const valueStr = safeJSONStringify(this.pendingRequests);

    const request = {
      LocalDBSetKV: {
        request_id: requestId,
        cid: 0n, // Global storage (BigInt for WASM u64)
        peer_cid: null,
        key: STORAGE_KEY,
        value: stringToBytes(valueStr)
      }
    };

    return new Promise((resolve, reject) => {
      this.pendingKVRequests.set(requestId, { resolve, reject });

      const client = websocketService.getClient();
      if (!client) {
        this.pendingKVRequests.delete(requestId);
        console.warn('PeerRegistrationStore: No WebSocket client - skipping persist');
        resolve(undefined);
        return;
      }

      client.sendDirectToInternalService(request)
        .catch(error => {
          console.error('PeerRegistrationStore: Failed to persist:', error);
          this.pendingKVRequests.delete(requestId);
          reject(error);
        });

      setTimeout(() => {
        if (this.pendingKVRequests.has(requestId)) {
          this.pendingKVRequests.delete(requestId);
          console.warn('PeerRegistrationStore: Persist timed out');
          resolve(undefined); // Don't fail on timeout
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  /**
   * Load pending requests from LocalDB
   */
  private async loadFromLocalDB(): Promise<void> {
    const requestId = crypto.randomUUID();

    const request = {
      LocalDBGetKV: {
        request_id: requestId,
        cid: 0n, // Global storage (BigInt for WASM u64)
        peer_cid: null,
        key: STORAGE_KEY
      }
    };

    return new Promise((resolve) => {
      this.pendingKVRequests.set(requestId, {
        resolve: async (data: unknown) => {
          if (data && Array.isArray(data)) {
            this.pendingRequests = data as PendingPeerRequest[];
            debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Loaded', data.length, 'pending requests');
            // Create notifications for current session's pending requests
            const currentSessionRequests = await this.getPendingRequests();
            debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Creating notifications for', currentSessionRequests.length, 'requests in current session');
            for (const request of currentSessionRequests) {
              this.createNotificationForRequest(request);
            }
            await this.emitUpdate();
          }
          resolve(undefined);
        },
        reject: () => {
          console.warn('PeerRegistrationStore: Failed to load from LocalDB');
          resolve(undefined);
        }
      });

      const client = websocketService.getClient();
      if (!client) {
        this.pendingKVRequests.delete(requestId);
        console.warn('PeerRegistrationStore: No WebSocket client - skipping load');
        resolve(undefined);
        return;
      }

      client.sendDirectToInternalService(request)
        .catch(error => {
          console.warn('PeerRegistrationStore: Failed to send load request:', error);
          this.pendingKVRequests.delete(requestId);
          resolve(undefined);
        });

      setTimeout(() => {
        if (this.pendingKVRequests.has(requestId)) {
          this.pendingKVRequests.delete(requestId);
          console.warn('PeerRegistrationStore: Load timed out');
          resolve(undefined);
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  /**
   * Persist outgoing requests to LocalDB
   */
  private async persistOutgoingToLocalDB(): Promise<void> {
    const requestId = crypto.randomUUID();
    // Use safeJSONStringify to handle BigInt CID values from WASM
    const { safeJSONStringify } = await import('./storage-utils');
    const valueStr = safeJSONStringify(this.outgoingRequests);

    const request = {
      LocalDBSetKV: {
        request_id: requestId,
        cid: 0n, // Global storage (BigInt for WASM u64)
        peer_cid: null,
        key: OUTGOING_STORAGE_KEY,
        value: stringToBytes(valueStr)
      }
    };

    return new Promise((resolve, reject) => {
      this.pendingKVRequests.set(requestId, { resolve, reject });

      const client = websocketService.getClient();
      if (!client) {
        this.pendingKVRequests.delete(requestId);
        console.warn('PeerRegistrationStore: No WebSocket client - skipping outgoing persist');
        resolve(undefined);
        return;
      }

      client.sendDirectToInternalService(request)
        .catch(error => {
          console.error('PeerRegistrationStore: Failed to persist outgoing:', error);
          this.pendingKVRequests.delete(requestId);
          reject(error);
        });

      setTimeout(() => {
        if (this.pendingKVRequests.has(requestId)) {
          this.pendingKVRequests.delete(requestId);
          console.warn('PeerRegistrationStore: Outgoing persist timed out');
          resolve(undefined);
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  /**
   * Load outgoing requests from LocalDB
   */
  private async loadOutgoingFromLocalDB(): Promise<void> {
    const requestId = crypto.randomUUID();

    const request = {
      LocalDBGetKV: {
        request_id: requestId,
        cid: 0n, // Global storage (BigInt for WASM u64)
        peer_cid: null,
        key: OUTGOING_STORAGE_KEY
      }
    };

    return new Promise((resolve) => {
      this.pendingKVRequests.set(requestId, {
        resolve: async (data: unknown) => {
          if (data && Array.isArray(data)) {
            // Filter out any invalid requests missing required fields (toCid, fromCid)
            const validRequests = (data as OutgoingPeerRequest[]).filter((r: OutgoingPeerRequest) => r.toCid && r.fromCid);
            const invalidCount = data.length - validRequests.length;
            if (invalidCount > 0) {
              console.warn(`PeerRegistrationStore: Filtered out ${invalidCount} invalid outgoing requests (missing toCid or fromCid)`);
            }
            this.outgoingRequests = validRequests;
            debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Loaded', validRequests.length, 'valid outgoing requests');
            await this.emitOutgoingUpdate();
          }
          resolve(undefined);
        },
        reject: () => {
          console.warn('PeerRegistrationStore: Failed to load outgoing from LocalDB');
          resolve(undefined);
        }
      });

      const client = websocketService.getClient();
      if (!client) {
        this.pendingKVRequests.delete(requestId);
        console.warn('PeerRegistrationStore: No WebSocket client - skipping outgoing load');
        resolve(undefined);
        return;
      }

      client.sendDirectToInternalService(request)
        .catch(error => {
          console.warn('PeerRegistrationStore: Failed to send outgoing load request:', error);
          this.pendingKVRequests.delete(requestId);
          resolve(undefined);
        });

      setTimeout(() => {
        if (this.pendingKVRequests.has(requestId)) {
          this.pendingKVRequests.delete(requestId);
          console.warn('PeerRegistrationStore: Outgoing load timed out');
          resolve(undefined);
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  /**
   * Set up event listeners for LocalDB responses and session changes
   */
  private setupEventListeners(): void {
    // Listen for session switches to refresh notifications
    eventEmitter.on('session-selected', () => {
      debugLog('PeerRegistrationStore', 'PeerRegistrationStore: Session switched, refreshing notifications');
      // Delay slightly to ensure connectionManager has updated
      setTimeout(() => {
        runAsyncSetup(async () => {
          await this.refreshNotificationsForCurrentSession();
        });
      }, 100);
    });

    // Start/stop poll loop based on leader status
    // Only leader tab should poll to prevent duplicate registration requests from multiple tabs
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      debugLog('PeerRegistrationStore', `PeerRegistrationStore: Leader changed - isLeader: ${data.isLeader}`);
      if (data.isLeader) {
        // Became leader, start poll loop if initialized
        if (this.isInitialized) {
          this.startPollLoop();
        }
      } else {
        // Lost leadership, stop poll loop
        this.stopPollLoop();
      }
    });

    eventEmitter.on('websocket-message', (message: any) => { // any: WebSocket discriminated union with optional chaining
      // Handle LocalDBSetKV success
      if (message.LocalDBSetKVSuccess) {
        const { request_id } = message.LocalDBSetKVSuccess;
        const pending = this.pendingKVRequests.get(request_id);
        if (pending) {
          this.pendingKVRequests.delete(request_id);
          pending.resolve(undefined);
        }
      }

      // Handle LocalDBGetKV success
      if (message.LocalDBGetKVSuccess) {
        const { request_id, value } = message.LocalDBGetKVSuccess;
        const pending = this.pendingKVRequests.get(request_id);
        if (pending) {
          this.pendingKVRequests.delete(request_id);
          try {
            if (value && value.length > 0) {
              const decoded = bytesToString(value);
              const parsed = JSON.parse(decoded);
              pending.resolve(parsed);
            } else {
              pending.resolve(null);
            }
          } catch (error) {
            console.error('PeerRegistrationStore: Failed to parse LocalDB value:', error);
            pending.resolve(null);
          }
        }
      }

      // Handle LocalDB failures
      if (message.LocalDBSetKVFailure || message.LocalDBGetKVFailure) {
        const failure = message.LocalDBSetKVFailure || message.LocalDBGetKVFailure;
        const pending = this.pendingKVRequests.get(failure.request_id);
        if (pending) {
          this.pendingKVRequests.delete(failure.request_id);
          pending.reject(new Error(failure.message || 'LocalDB operation failed'));
        }
      }

      // Handle PeerRegisterSuccess - remove from outgoing requests
      if (message.PeerRegisterSuccess) {
        const { request_id, cid, peer_cid } = message.PeerRegisterSuccess;
        debugLog('PeerRegistrationStore', 'PeerRegistrationStore: PeerRegisterSuccess received', { request_id, cid: cid?.toString(), peer_cid: peer_cid?.toString() });

        // Remove from outgoing requests by request_id or peer_cid
        const peerCidBigInt: bigint | undefined = peer_cid;
        if (peerCidBigInt !== undefined) {
          this.removeOutgoingRequestByPeer(peerCidBigInt).catch(console.error);
        }
      }

      // Handle PeerRegisterFailure - remove from outgoing requests
      if (message.PeerRegisterFailure) {
        const { request_id, cid, peer_cid, message: errorMsg } = message.PeerRegisterFailure;
        debugLog('PeerRegistrationStore', 'PeerRegistrationStore: PeerRegisterFailure received', { request_id, cid: cid?.toString(), peer_cid: peer_cid?.toString(), errorMsg });

        // Remove from outgoing requests by peer_cid
        const peerCidBigInt: bigint | undefined = peer_cid;
        if (peerCidBigInt !== undefined) {
          this.removeOutgoingRequestByPeer(peerCidBigInt).catch(console.error);
        }
      }

      // Handle PeerConnectSuccess - clear pending requests for connected peer
      if (message.PeerConnectSuccess) {
        const peer_cid: bigint | undefined = message.PeerConnectSuccess.peer_cid;
        if (peer_cid !== undefined) {
          debugLog('PeerRegistrationStore', `[PeerRegistrationStore] Clearing requests for connected peer ${peer_cid.toString()}`);

          // Clear both incoming and outgoing requests
          this.removeRequestByPeerCid(peer_cid).catch(console.error);
          this.removeOutgoingRequestByPeer(peer_cid).catch(console.error);

          // Emit update event to refresh UI
          eventEmitter.emit('peer-requests:updated');
        }
      }
    });
  }

  /**
   * Emit update event for UI components (filtered by current session)
   */
  private async emitUpdate(): Promise<void> {
    const currentCid = await this.getCurrentSessionCid();
    const currentSessionRequests = await this.getPendingRequests();
    debugLog('PeerRegistrationStore', `[P2P] PeerRegistrationStore emitUpdate: currentCid=${currentCid?.toString()}, pendingRequests.length=${this.pendingRequests.length}, filteredCount=${currentSessionRequests.length}`);
    debugLog('PeerRegistrationStore', `[P2P] PeerRegistrationStore emitUpdate: pending request CIDs: [${this.pendingRequests.map(r => r.cid.toString()).join(', ')}]`);
    debugLog('PeerRegistrationStore', `[P2P] PeerRegistrationStore emitting peer-requests:updated event with count=${currentSessionRequests.length}`);
    eventEmitter.emit('peer-requests:updated', {
      requests: currentSessionRequests,
      count: currentSessionRequests.length
    });
  }

  /**
   * Emit outgoing update event for UI components
   */
  private async emitOutgoingUpdate(): Promise<void> {
    const currentSessionOutgoing = await this.getOutgoingRequests();
    eventEmitter.emit('outgoing-peer-requests:updated', {
      requests: currentSessionOutgoing,
      cids: new Set(currentSessionOutgoing.map(r => r.toCid))
    });
  }
}

export const peerRegistrationStore = PeerRegistrationStore.getInstance();
