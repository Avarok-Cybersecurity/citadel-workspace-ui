/**
 * Whether a group message was sent by the person using this tab.
 *
 * The two group wires name the sender differently: a peer group gives the sender's CID, an
 * office/room/node channel gives the account USERNAME (the workspace server writes
 * `actor_user_id`). Comparing only with the CID -- as the notification bell and the unread count
 * both did -- never matched an office message, so your own messages rang your bell and counted
 * as unread. One rule, used by both, matching either identifier, as GroupMessageItem already did.
 */
import { instanceManager } from '@/lib/multi-instance';
import { connectionManager } from '@/lib/connection';

export interface GroupSelf {
  cid: bigint | null;
  username: string | undefined;
}

/** Pure: the sender is you when it names your CID or your username. */
export function isOwnGroupMessage(senderId: string, self: GroupSelf): boolean {
  if (!senderId) return false;
  if (self.cid !== null && senderId === String(self.cid)) return true;
  return Boolean(self.username) && senderId === self.username;
}

/** This tab's identity, read where a group message arrives. */
export function currentGroupSelf(): GroupSelf {
  return { cid: instanceManager.cid, username: connectionManager.getConnectionInfo()?.username };
}
