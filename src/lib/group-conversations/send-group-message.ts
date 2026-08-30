/**
 * Sending one message into whichever kind of group this is.
 *
 * Two groups sit behind one chat view and they differ in three ways that all
 * have to be handled together, which is why this is one function rather than a
 * branch in the hook:
 *
 *  - WHERE it goes. A node-backed chat channel belongs to the workspace server;
 *    a peer group is keyed `<cid>:<mgid>`, owned by no node, and that server
 *    refuses it -- "Permission denied: not a member of this chat channel".
 *  - WHETHER it comes back. The workspace server answers the SENDER with the
 *    same notification it broadcasts to everyone, and that echo is what puts
 *    the message on your own screen. The peer wire answers with
 *    `GroupMessageSuccess`, which carries no content, so the sender has to
 *    place its own copy or watch the composer clear and nothing appear.
 *  - WHICH id it has. The local copy uses the id the send minted, so an echo --
 *    if one ever arrives -- is deduped by `handleNewMessage` rather than
 *    printed twice.
 */
import WorkspaceService from '@/lib/workspace-service';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { groupSendTransport } from './group-send-transport';
import { sendPeerGroupMessage } from './group-requests';
import { deliverPeerGroupMessage } from './peer-group-delivery';

export async function sendGroupMessageAnywhere(
  groupId: string,
  content: string,
  replyTo?: string,
): Promise<void> {
  if (groupSendTransport(groupId) !== 'peer') {
    await WorkspaceService.sendGroupMessage(groupId, content, GroupMessageTypeTS.Text, replyTo);
    return;
  }

  const messageId: string = await sendPeerGroupMessage(groupId, content, replyTo);
  deliverPeerGroupMessage({
    groupId,
    messageId,
    senderId: String(instanceManager.cid ?? ''),
    senderName: 'You',
    content,
    timestamp: Date.now(),
    replyTo,
  });
}
