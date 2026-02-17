/**
 * Peer Registration Store - Request Lifecycle
 *
 * Handles incoming request processing, accept/decline flows,
 * outgoing request polling, and resend logic.
 */

import { eventEmitter } from '../event-emitter';
import { websocketService } from '../websocket-service';
import { notificationService } from '../notification-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import { p2pRegistrationService } from '../p2p-registration-service';
import { getDefaultSecuritySettings } from '../security-utils';
import { debugLog } from '@/lib/debug-config';
import { OUTGOING_RESEND_THRESHOLD_MS } from './constants';
import { hasRequestFromPeer } from './state';
import { waitForAcceptResponse } from './accept-matcher';
import type {
  PendingPeerRequest,
  OutgoingPeerRequest,
  PeerRegisterNotification,
} from './types';
import { toInternalServiceRequest } from './types';

/**
 * Create a notification card with accept/decline callbacks
 */
export function createNotificationWithCallbacks(
  request: PendingPeerRequest,
  onAccept: (id: string) => void,
  onDecline: (id: string) => void
): void {
  notificationService.addPeerRegistrationNotification(
    request.peer_username,
    request.peer_cid.toString(),
    request.id,
    () => onAccept(request.id),
    () => onDecline(request.id),
    () => eventEmitter.emit('open-pending-requests-modal'),
    request.cid.toString()
  );
}

/**
 * Process an incoming PeerRegisterNotification.
 * Returns the created PendingPeerRequest or null if rejected (duplicate/invalid).
 */
export function processIncomingNotification(
  pendingRequests: PendingPeerRequest[],
  notification: PeerRegisterNotification
): PendingPeerRequest | null {
  debugLog('PeerRegistrationStore', '[P2P] handleIncomingRequest ENTERED with:', {
    cid: notification.cid?.toString(),
    peer_cid: notification.peer_cid?.toString(),
    peer_username: notification.peer_username
  });

  const peerCid = notification.peer_cid;
  const peerUsername = notification.peer_username || 'Unknown';
  const notificationTargetCid = notification.cid;

  if (peerCid === undefined) { debugLog('PeerRegistrationStore', 'Invalid notification - missing peer_cid'); return null; }
  if (notificationTargetCid === undefined) { debugLog('PeerRegistrationStore', 'Invalid notification - missing target cid'); return null; }
  if (peerCid === notificationTargetCid) { debugLog('PeerRegistrationStore', 'Ignoring self-notification'); return null; }
  if (hasRequestFromPeer(pendingRequests, peerCid, notificationTargetCid)) {
    debugLog('PeerRegistrationStore', 'Duplicate request from peer', peerCid.toString(), 'to', notificationTargetCid.toString());
    return null;
  }

  const ts = Date.now();
  debugLog('PeerRegistrationStore', `Creating request with timestamp ${ts} (${new Date(ts).toISOString()})`);

  return {
    id: crypto.randomUUID(),
    peer_cid: peerCid,
    peer_username: peerUsername,
    timestamp: ts,
    cid: notificationTargetCid,
  };
}

/**
 * Execute the accept flow for a pending request.
 * Sends PeerRegister back to the peer and waits for response.
 */
export async function executeAcceptRequest(request: PendingPeerRequest): Promise<void> {
  const currentCid = request.cid;
  if (!currentCid) throw new Error('No active session - cannot accept registration');

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

  debugLog('PeerRegistrationStore', 'acceptRequest waiting for response', { registerRequestId, targetPeerCid: request.peer_cid });

  const responsePromise = waitForAcceptResponse(registerRequestId, request.peer_cid, currentCid);

  debugLog('PeerRegistrationStore', 'Claiming session', currentCid, 'before sending PeerRegister');
  await websocketService.claimSession(currentCid);
  await websocketService.sendMessage(registerRequest);
  await responsePromise;

  p2pAutoConnectService.connectToPeer(request.peer_cid).catch((err) => {
    debugLog('PeerRegistrationStore', 'Auto-connect after accept failed:', err);
  });
}

/**
 * Resend a PeerRegister request for an outgoing request
 */
export async function resendPeerRegister(request: OutgoingPeerRequest): Promise<void> {
  const client = websocketService.getClient();
  if (!client) throw new Error('No WebSocket client available');

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
  await client.sendDirectToInternalService(toInternalServiceRequest(registerRequest));
  debugLog('PeerRegistrationStore', 'Resent PeerRegister to', request.peerUsername);
}

/**
 * Process a single outgoing request during poll.
 * Returns 'remove' if the request should be removed, 'updated' if timeLastSent was updated,
 * or 'skip' if no action was taken.
 */
export async function processPollRequest(
  request: OutgoingPeerRequest,
  now: number
): Promise<'remove' | 'updated' | 'skip'> {
  if (p2pRegistrationService.isPeerRegistered(request.toCid)) {
    debugLog('PeerRegistrationStore', `Removing stale request for ${request.peerUsername} - already registered`);
    return 'remove';
  }
  if (!request.toCid) { debugLog('PeerRegistrationStore', 'Removing invalid request without toCid'); return 'remove'; }

  const elapsed = now - request.timeLastSent;
  if (elapsed < OUTGOING_RESEND_THRESHOLD_MS) return 'skip';

  debugLog('PeerRegistrationStore', 'Resending request to', request.peerUsername, '(elapsed:', elapsed, 'ms)');

  try {
    await resendPeerRegister(request);
    request.timeLastSent = Date.now();
    return 'updated';
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('already') || errorMsg.includes('duplicate') || errorMsg.includes('exists')) {
      debugLog('PeerRegistrationStore', 'Request already exists in protocol queue, continuing');
      request.timeLastSent = Date.now();
      return 'updated';
    } else if (errorMsg.includes('Ratchet does not exist')) {
      debugLog('PeerRegistrationStore', `Ratchet error for ${request.peerUsername}, removing stale request`);
      return 'remove';
    } else {
      debugLog('PeerRegistrationStore', 'Failed to resend to', request.peerUsername, ':', errorMsg);
      return 'skip';
    }
  }
}
