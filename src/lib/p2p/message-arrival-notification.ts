/**
 * The toast for a message that arrived while you were looking elsewhere.
 *
 * Split out of `message-handler-routing.ts` to keep it under the length cap.
 * The peer's name comes from `lib/peer-display` rather than being assembled
 * here: this site used to build `Peer <first 8 CID digits>` of its own, which
 * is the exact rendering that module exists to abolish, and which disagreed
 * with the two other hand-rolled variants elsewhere in the app.
 */
import { peerDisplayName } from '@/lib/peer-display';
import { eventEmitter } from '../event-emitter';
import type { MessageHandlerConfig } from './message-handler-types';
import type { P2PMessage, P2PConversation } from './p2p-types';

/** How much of the message body the toast shows. */
const PREVIEW_LENGTH: number = 100;

export function notifyMessageArrived(
  config: MessageHandlerConfig,
  peerCid: bigint,
  message: P2PMessage,
  recipientCid?: bigint,
): void {
  if (!config.shouldShowNotification(peerCid)) return;

  const conversation: P2PConversation | undefined = config.getConversations().get(peerCid);
  const peerUsername: string = peerDisplayName({ cid: peerCid, username: conversation?.peerUsername });

  config.addNotification(
    `New message from ${peerUsername}`,
    message.content.substring(0, PREVIEW_LENGTH),
    peerCid.toString(),
    message.id,
    recipientCid?.toString(),
    {
      peerCid: peerCid.toString(),
      onOpen: (): void => {
        eventEmitter.emit('p2p:open-conversation', { peerCid: peerCid.toString() });
      },
    },
  );
}
