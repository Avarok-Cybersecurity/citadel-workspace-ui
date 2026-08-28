/**
 * P2P Registration Service - Registration State Machine
 *
 * Handles WebSocket message routing for registration responses/notifications,
 * peer registration execution, and batch registration of unregistered peers.
 */

import { websocketService } from '../websocket-service';
import { failOnSocketLoss } from '../websocket/request-response';
import { broadcastChannelService } from '../broadcast-channel-service';
import { instanceManager } from '../multi-instance';
import { debugLog } from '@/lib/debug-config';
import type { InternalServiceRequest } from 'citadel-workspace-client-ts';
import type { WebSocketMessage } from '@/types/ws-message-types';
import { eventEmitter } from '../event-emitter';
import type { Peer, PendingRequestEntry, PeerRegistrationOptions } from './types';
import {
  toGeneratedSecuritySettings, DEFAULT_SESSION_SECURITY,
  CONCURRENT_REGISTRATIONS, PEER_REGISTER_TIMEOUT_MS,
} from './constants';
import { getCurrentCid } from './discovery';

/** Context passed from the service so the message handler can read/write shared state. */
export interface RegistrationContext {
  pendingRequests: Map<string, PendingRequestEntry>;
  allPeers: Map<bigint, Peer>;
  registeredPeers: Map<bigint, Peer>;
  outgoingRegistrations: Set<bigint>;
  incomingRegistrations: Set<bigint>;
  handleIncomingRegistration: (notificationCid: bigint, peerCid: bigint, peerUsername?: string) => Promise<void>;
}

/** Route an incoming WebSocket message to the appropriate handler. */
export function handleWebSocketMessage(message: WebSocketMessage, ctx: RegistrationContext): void {
  const msg = message as Record<string, Record<string, unknown> | undefined>;
  if (msg.ListAllPeersResponse) {
    resolveRequest(ctx.pendingRequests, msg.ListAllPeersResponse.request_id as string, msg.ListAllPeersResponse);
  } else if (msg.ListAllPeersFailure) {
    rejectRequest(ctx.pendingRequests, msg.ListAllPeersFailure.request_id as string,
      (msg.ListAllPeersFailure.message as string) || 'Failed to list peers');
  } else if (msg.ListRegisteredPeersResponse) {
    resolveRequest(ctx.pendingRequests, msg.ListRegisteredPeersResponse.request_id as string, msg.ListRegisteredPeersResponse);
  } else if (msg.ListRegisteredPeersFailure) {
    rejectRequest(ctx.pendingRequests, msg.ListRegisteredPeersFailure.request_id as string,
      (msg.ListRegisteredPeersFailure.message as string) || 'Failed to list registered peers');
  } else if (msg.PeerRegisterSuccess) {
    handlePeerRegisterSuccess(msg.PeerRegisterSuccess, ctx);
  } else if (msg.PeerRegisterFailure) {
    handlePeerRegisterFailure(msg.PeerRegisterFailure, ctx);
  } else if (msg.PeerRegisterNotification) {
    handlePeerRegisterNotification(msg.PeerRegisterNotification, ctx);
  }
}

function resolveRequest(pending: Map<string, PendingRequestEntry>, requestId: string, data: Record<string, unknown>): void {
  const entry = pending.get(requestId);
  if (entry) { entry.resolve(data); pending.delete(requestId); }
}

function rejectRequest(pending: Map<string, PendingRequestEntry>, requestId: string, errorMsg: string): void {
  const entry = pending.get(requestId);
  if (entry) { entry.reject(new Error(errorMsg)); pending.delete(requestId); }
}

/** Ensure a peer exists in context maps and mark as registered. Returns the peer. */
function ensurePeerRegistered(ctx: RegistrationContext, peerCid: bigint, peerUsername?: string): Peer {
  const fallbackName = peerUsername || `User ${peerCid.toString().slice(0, 8)}`;
  const peer = ctx.allPeers.get(peerCid) || {
    cid: peerCid, username: fallbackName, fullName: fallbackName, isOnline: true, isRegistered: true
  };
  peer.isRegistered = true;
  if (peerUsername && (peer.username === 'Unknown' || peer.username.startsWith('User '))) {
    peer.username = peerUsername;
    peer.fullName = peerUsername;
  }
  ctx.registeredPeers.set(peerCid, peer);
  if (!ctx.allPeers.has(peerCid)) ctx.allPeers.set(peerCid, peer);
  return peer;
}

/** Broadcast peer update to follower tabs if we are the leader. */
function broadcastPeerUpdate(peerCid: bigint, username: string, flags: { isOutgoing?: boolean; isIncoming?: boolean }): void {
  if (!instanceManager.isLeader) return;
  debugLog('P2PRegistrationService', `[P2P-SYNC] Leader broadcasting registeredPeers update: ${peerCid.toString().slice(0, 8)}...`);
  broadcastChannelService.broadcastStateSync({
    type: 'registered-peer-update', peerCid: peerCid.toString(), peerUsername: username, ...flags,
  });
}

function handlePeerRegisterSuccess(data: Record<string, unknown>, ctx: RegistrationContext): void {
  resolveRequest(ctx.pendingRequests, data.request_id as string, data);
  const peerCid = data.peer_cid as bigint | undefined;
  const peerUsername = data.peer_username as string | undefined;
  if (peerCid !== undefined) {
    ctx.outgoingRegistrations.add(peerCid);
    const peer = ensurePeerRegistered(ctx, peerCid, peerUsername);
    eventEmitter.emit('p2p:peer-registered', { peer, isOutgoing: true });
    broadcastPeerUpdate(peerCid, peer.username, { isOutgoing: true });
  }
}

function handlePeerRegisterFailure(data: Record<string, unknown>, ctx: RegistrationContext): void {
  const requestId = data.request_id as string;
  const errorMsg = (data.message as string) || 'Failed to register peer';
  const peerCid = data.peer_cid as bigint | undefined;

  if (errorMsg.includes('already registered')) {
    debugLog('P2PRegistrationService', `[P2P] Peer ${peerCid?.toString()} already registered - treating as success`);
    if (peerCid !== undefined) {
      ctx.outgoingRegistrations.add(peerCid);
      const peer = ensurePeerRegistered(ctx, peerCid);
      eventEmitter.emit('p2p:peer-registered', { peer, isOutgoing: true, wasAlreadyRegistered: true });
      broadcastPeerUpdate(peerCid, peer.username, { isOutgoing: true });
    }
    resolveRequest(ctx.pendingRequests, requestId, { peer_cid: peerCid, already_registered: true });
  } else {
    rejectRequest(ctx.pendingRequests, requestId, errorMsg);
  }
}

function handlePeerRegisterNotification(data: Record<string, unknown>, ctx: RegistrationContext): void {
  const notificationCid = data.cid as bigint | undefined;
  const peerCid = data.peer_cid as bigint | undefined;
  const peerUsername = data.peer_username as string | undefined;
  debugLog('P2PRegistrationService', '[P2P] Peer registered with us:', {
    cid: notificationCid?.toString(), peer_cid: peerCid?.toString(),
    peer_username: peerUsername, request_id: data.request_id
  });

  if (peerCid !== undefined && notificationCid !== undefined) {
    const fallbackName = peerUsername || 'Unknown';
    const peer = ctx.allPeers.get(peerCid) || {
      cid: peerCid, username: fallbackName, fullName: peerUsername || 'Unknown User',
      isOnline: true, isRegistered: false
    };
    // NOT marked registered, and NOT added to `registeredPeers`.
    //
    // This notification is an incoming *request*. The backend defines registered
    // as mutual — `list_registered` answers from `GetMutuals` — so recording it
    // here claimed a relationship that does not exist until the user accepts.
    //
    // It was not cosmetic: `MessageSender` checks `isPeerRegistered` and skips
    // registration when it is true, so a first message to someone whose request
    // was merely pending went out against a peer with no mutual registration and
    // no ratchet, and failed. The peer also appeared among the user's
    // connections before they had agreed to anything.
    //
    // `allPeers` still learns the name, so the request renders with a username
    // rather than a bare CID, and `handleIncomingRegistration` below still runs
    // the pending-request flow. Auto-connect's mutual detection keys off
    // `hasOutgoingRegistration`, not this map, so it is unaffected.
    ctx.allPeers.set(peerCid, peer);
    eventEmitter.emit('p2p:peer-registered', { peer, isIncoming: true });
    broadcastPeerUpdate(peerCid, peer.username, { isIncoming: true });
    ctx.handleIncomingRegistration(notificationCid, peerCid, peerUsername).catch(error => {
      debugLog('P2PRegistrationService', 'Failed to handle incoming registration:', error);
    });
  }
  eventEmitter.emit('p2p:peer-registered-with-us', { peerCid, peerUsername });
}

/** Register a specific peer via PeerRegister request. */
export async function registerPeer(
  peerCid: bigint, options: PeerRegistrationOptions,
  pendingRequests: Map<string, PendingRequestEntry>
): Promise<void> {
  const currentCid = await getCurrentCid();
  if (!currentCid || currentCid === 0n) throw new Error('No active user session (CID 0 is service connection)');
  if (peerCid === currentCid) throw new Error('Cannot register with self');

  const requestId = crypto.randomUUID();
  broadcastChannelService.registerRequest(requestId, currentCid);
  const request: InternalServiceRequest = {
    PeerRegister: {
      request_id: requestId, cid: currentCid, peer_cid: peerCid,
      session_security_settings: toGeneratedSecuritySettings(options.sessionSecuritySettings || DEFAULT_SESSION_SECURITY),
      connect_after_register: options.connectAfterRegister ?? false,
      peer_session_password: null
    }
  };
  const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        broadcastChannelService.clearRequest(requestId);
        reject(new Error('PeerRegister request timed out'));
      }
    }, PEER_REGISTER_TIMEOUT_MS);
  });
  await websocketService.sendMessage(request);
  await failOnSocketLoss('PeerRegister', responsePromise);
  debugLog('P2PRegistrationService', `Successfully registered peer ${peerCid}`);
}

/** Register all unregistered peers in batches. */
export async function registerUnregisteredPeers(
  allPeers: Map<bigint, Peer>, options: PeerRegistrationOptions,
  pendingRequests: Map<string, PendingRequestEntry>
): Promise<void> {
  const unregistered = Array.from(allPeers.values()).filter(p => !p.isRegistered);
  if (unregistered.length === 0) return;
  debugLog('P2PRegistrationService', `Found ${unregistered.length} unregistered peers, registering...`);
  for (let i = 0; i < unregistered.length; i += CONCURRENT_REGISTRATIONS) {
    const batch = unregistered.slice(i, i + CONCURRENT_REGISTRATIONS);
    await Promise.all(batch.map(peer =>
      registerPeer(peer.cid, options, pendingRequests).catch(error => {
        debugLog('P2PRegistrationService', `Failed to register peer ${peer.cid}:`, error);
      })
    ));
  }
}
