/**
 * Peer Registration Store - Accept Response Matcher
 *
 * Handles the WebSocket response matching logic for accepting peer registrations.
 * Extracted from lifecycle.ts due to the complexity of the multi-variant matching.
 */

import { eventEmitter } from '../event-emitter';
import { failOnSocketLoss } from '../websocket/request-response';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage } from '@/lib/ws-message-boundary';
import { TIMEOUT } from '../timeout-constants';
import { toCidKey, type CidLike } from '@/lib/utils/cid-utils';

/**
 * Wait for a PeerRegister/PeerConnect response matching the given request.
 * Matches by request_id (primary), peer_cid (fallback), or session notification.
 */
export function waitForAcceptResponse(
  registerRequestId: string,
  targetPeerCid: bigint,
  currentCid: bigint
): Promise<void> {
  const targetKey: string = toCidKey(targetPeerCid);

  return failOnSocketLoss('AcceptPeerRegister', new Promise<void>((resolve, reject) => {
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

      const matchesByPeerCid = !!targetKey && toCidKey(responsePeerCid as CidLike) === targetKey;
      const matchesByCid = !!targetKey && toCidKey(responseCid as CidLike) === targetKey;

      const currentKey: string = toCidKey(currentCid);
      const isOurNotification = !!msg.PeerConnectNotification && !!currentKey &&
        (toCidKey(msg.PeerConnectNotification.cid as CidLike) === currentKey ||
         toCidKey(msg.PeerConnectNotification.peer_cid as CidLike) === currentKey);

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
        const errorMsg: string = (msg.PeerRegisterFailure?.message as string) ||
                        (msg.PeerConnectFailure?.message as string) || 'Registration failed';
        reject(new Error(errorMsg));
      }
    };

    eventEmitter.on('websocket-message', handleMessage);
  }));
}
