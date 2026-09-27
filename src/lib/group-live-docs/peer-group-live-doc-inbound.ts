/**
 * A peer group's live-document traffic arriving from the internal service.
 *
 * As with reactions, the GROUP KEY decides which group this is; the envelope's own `group_id`
 * is the sender's claim and is not trusted. Who sent it does not matter to a CRDT: any
 * member's update applies the same way, and only members receive the group's messages.
 */
import { decodeGroupLiveDoc, type GroupLiveDocBody, type PeerGroupLiveDoc } from './group-doc-codec';
import { groupKeyToId, parseGroupKey, type MessageGroupKey } from '@/lib/group-conversations/group-key';

export interface GroupLiveDocEvent { groupId: string; body: GroupLiveDocBody }

/** The `group:live-doc-received` payload, or null when this is not live-document traffic. */
export function peerGroupLiveDocEvent(notification: Record<string, unknown>): GroupLiveDocEvent | null {
  const raw: unknown = notification.message;
  if (!Array.isArray(raw)) return null;
  const decoded: PeerGroupLiveDoc | null = decodeGroupLiveDoc(new Uint8Array(raw as number[]));
  if (!decoded) return null;
  // Throws on a malformed key, like every other arm; group-response-service catches and logs.
  const key: MessageGroupKey = parseGroupKey(notification.group_key);
  return { groupId: groupKeyToId(key), body: decoded.live_doc };
}
