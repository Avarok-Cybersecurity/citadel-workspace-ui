/**
 * Peer Registration Store - Accept Response Matcher
 *
 * Handles the WebSocket response matching logic for accepting peer registrations.
 * Extracted from lifecycle.ts due to the complexity of the multi-variant matching.
 */

import { eventEmitter } from '../event-emitter';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage } from '@/lib/ws-message-boundary';
import { TIMEOUT } from '../timeout-constants';

type CidLike = bigint | string | number | null | undefined;

/**
 * Normalize CID for comparison - extract last 10 digits to handle JS precision loss
 * with u64 values.
 */
export function normalizeCid(cid: CidLike): string {
  if (!cid) return '';
  const str = cid.toString();
  return str.length > 10 ? str.slice(-10) : str;
}

/**
 * Wait for a PeerRegister/PeerConnect response matching the given request.
 * Matches by request_id (primary), peer_cid (fallback), or session notification.
 */
export function waitForAcceptResponse(
  registerRequestId: string,
  targetPeerCid: bigint,
  currentCid: bigint
): Promise<void> {
  const targetNormalized = normalizeCid(targetPeerCid);

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      eventEmitter.off('websocket-message', handleMessage);
      reject(new Error('Registration request timed out'));
    }, TIMEOUT.PEER_REGISTER_MS);

    const handleMessage = (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;

      const msg = message as Record<string, Record<string, unknown> | undefined>;

      const matchesByRequestId =
        msg.PeerRegisterSuccess?.request_id === registerRequestId ||
        msg.PeerConnectSuccess?.request_id === registerRequestId;

      const responsePeerCid =
        msg.PeerRegisterSuccess?.peer_cid ||
        msg.PeerConnectSuccess?.peer_cid ||
        msg.PeerConnectNotification?.peer_cid;
      const responseCid = msg.PeerConnectNotification?.cid;

      const matchesByPeerCid = normalizeCid(responsePeerCid as CidLike) === targetNormalized && !!targetNormalized;
      const matchesByCid = normalizeCid(responseCid as CidLike) === targetNormalized && !!targetNormalized;

      const isOurNotification = msg.PeerConnectNotification &&
        (normalizeCid(msg.PeerConnectNotification.cid as CidLike) === normalizeCid(currentCid) ||
         normalizeCid(msg.PeerConnectNotification.peer_cid as CidLike) === normalizeCid(currentCid));

      if (msg.PeerRegisterSuccess || msg.PeerConnectSuccess || msg.PeerConnectNotification) {
        debugLog('PeerRegistrationStore', 'Checking response match', {
          messageType: msg.PeerRegisterSuccess ? 'PeerRegisterSuccess' :
                      msg.PeerConnectSuccess ? 'PeerConnectSuccess' : 'PeerConnectNotification',
          matchesByRequestId, matchesByPeerCid, matchesByCid, isOurNotification
        });
      }

      if (matchesByRequestId || matchesByPeerCid || matchesByCid || isOurNotification) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('PeerRegistrationStore', 'Registration succeeded', { targetPeerCid });
        resolve();
      } else if (msg.PeerRegisterFailure?.request_id === registerRequestId ||
                 msg.PeerConnectFailure?.request_id === registerRequestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        const errorMsg = (msg.PeerRegisterFailure?.message as string) ||
                        (msg.PeerConnectFailure?.message as string) || 'Registration failed';
        reject(new Error(errorMsg));
      }
    };

    eventEmitter.on('websocket-message', handleMessage);
  });
}
