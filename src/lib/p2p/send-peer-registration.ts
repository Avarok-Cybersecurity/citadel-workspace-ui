import { peerRegistrationStore } from '@/lib/peer-registration-store';
import { websocketService } from '@/lib/websocket-service';
import { getDefaultSecuritySettings } from '@/lib/security-utils';

/**
 * Send a peer registration request, and record it so it can be resent.
 *
 * Extracted from the peer-discovery modal's hook because the User Directory had
 * a SECOND, entirely inert path to the same action: it called
 * `connectionService.sendRegistrationRequest`, which pushed the request into an
 * in-memory array and scheduled a demo simulation. Nothing touched the socket,
 * and the user was shown "Request Sent — connection request sent to X". X never
 * received anything, ever.
 *
 * Two entry points for one action, one of them real. This is the real one, and
 * now it is the only one.
 *
 * Returns the request id so the caller can correlate a later failure.
 */
export async function sendPeerRegistration(
  ownCid: bigint,
  peerCid: bigint,
  peerUsername: string,
  /**
   * Supplied when the caller has already registered the id for correlation --
   * the discovery modal broadcasts it and records it before sending, so a
   * failure arriving early can still be matched to the peer it was about.
   */
  existingRequestId?: string,
): Promise<string> {
  const requestId = existingRequestId ?? crypto.randomUUID();
  const now = Date.now();

  // Recorded BEFORE the send. A failure notification can arrive before the
  // send's own promise resolves, and a request that failed is still a request
  // the user made — it belongs in the outgoing list either way.
  await peerRegistrationStore.addOutgoingRequest({
    id: requestId,
    fromCid: ownCid,
    toCid: peerCid,
    peerUsername,
    timestamp: now,
    timeLastSent: now,
  });

  await websocketService.sendMessage({
    PeerRegister: {
      request_id: requestId,
      cid: ownCid,
      peer_cid: peerCid,
      session_security_settings: getDefaultSecuritySettings(),
      connect_after_register: false,
      peer_session_password: null,
    },
  });

  return requestId;
}
