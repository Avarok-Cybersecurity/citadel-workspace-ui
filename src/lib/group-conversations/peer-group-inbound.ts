/**
 * A peer-group message arriving from the internal service.
 *
 * The workspace protocol has a `GroupMessageNotification` too, and it is a
 * different shape: `{ group_id, message }` there, where `message` is already a
 * `GroupMessage`. This one is `{ cid, peer_cid, message: number[], group_key,
 * request_id }` — an opaque body the two peers agree on, see
 * group-message-codec.
 *
 * A translator, like everything else in group-events: it turns a wire message
 * into the event the store already reads, rather than reaching for the store
 * itself. Two rules matter and both are tested:
 *
 *  - an unreadable body is dropped, not thrown. A peer on a different build
 *    would otherwise take down the handling of everything queued behind it.
 *  - the GROUP KEY decides which conversation this belongs to, never the body.
 *    The envelope is written by the sender; the key is the protocol's. A body
 *    naming another group would otherwise file the message into a conversation
 *    it was never sent to.
 */
import { decodeGroupMessage, type PeerGroupMessage } from './group-message-codec';
import { groupKeyToId, type MessageGroupKey } from './group-key';
import { debugLog } from '@/lib/debug-config';

export interface PeerGroupMessageSummary {
  groupId: string;
  /** The sender's id for this message; survives redelivery. */
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

/** The `group:message-received` payload for this notification, or null. */
export function peerGroupMessageEvent(
  notification: Record<string, unknown>,
  peerName: (cid: bigint) => string,
): PeerGroupMessageSummary | null {
  const raw: unknown = notification.message;
  if (!Array.isArray(raw)) return null;

  const decoded: PeerGroupMessage | null = decodeGroupMessage(new Uint8Array(raw as number[]));
  if (!decoded) {
    debugLog('PeerGroupInbound', 'Dropped a group message body that did not decode');
    return null;
  }

  // String only here, at the event boundary: `group:message-received` has
  // always carried senderId as a string and group-store compares it against
  // String(own). The wire and this module keep the bigint.
  return {
    groupId: groupKeyToId(notification.group_key as MessageGroupKey),
    messageId: decoded.message_id,
    senderId: decoded.sender_cid.toString(),
    senderName: peerName(decoded.sender_cid),
    content: decoded.content,
    timestamp: decoded.timestamp,
  };
}
