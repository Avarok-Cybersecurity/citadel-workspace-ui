/**
 * Routing a channel message to its handler.
 *
 * Split out of `InstanceChannel` so the class holds the socket lifecycle and
 * this holds the switch — the two change for entirely different reasons.
 */

import { debugLog } from '@/lib/debug-config';
import type { ChannelMessage } from './channel-types';
import type { LeaderElectionState } from './channel-leader-election';
import {
  handleOutboundRequest,
  handleOutboundAck,
  handleInboundForward,
  handleInboundAck,
  handleInstanceAnnounce,
  handleInstanceGoodbye,
  handleSessionRelease,
  handleCidUpdate,
} from './channel-messaging';
import { handleLeaderElection, handleLeaderHeartbeat } from './channel-leader-election';

export function dispatchChannelMessage(
  message: ChannelMessage,
  electionState: LeaderElectionState,
  broadcastCid: () => void
): void {
  if (message.type !== 'leader-heartbeat') {
    debugLog('InstanceChannel', `[InstanceChannel] Received ${message.type} from ${message.senderInstanceId}`);
  }

  switch (message.type) {
    case 'outbound-request': handleOutboundRequest(message); break;
    case 'outbound-ack': handleOutboundAck(message); break;
    case 'inbound-forward': handleInboundForward(message); break;
    case 'inbound-ack': handleInboundAck(message); break;
    case 'leader-election': handleLeaderElection(electionState, message); break;
    case 'leader-heartbeat': handleLeaderHeartbeat(electionState, message); break;
    case 'instance-announce': handleInstanceAnnounce(electionState, message); break;
    case 'instance-goodbye': handleInstanceGoodbye(electionState, message); break;
    case 'session-release': handleSessionRelease(message); break;
    case 'cid-update': handleCidUpdate(message); break;
    // Self-heal: leader missed our cid-update. No `instanceManager.cid` guard so
    // broadcastCid()'s tab-context fallback runs — post claim/reload owners
    // (CID not yet in instanceManager) still answer; the old guard stranded them.
    case 'cid-report-request': broadcastCid(); break;
  }
}
