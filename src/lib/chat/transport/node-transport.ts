/**
 * A node channel's transport: an office's or room's chat, held by the workspace server.
 *
 * The server stores every message and mints its id, so history pages come from it and the
 * reader's own message is shown at once and confirmed by the server's copy (pending-group-sends).
 * Markdown rides the wire's `Markdown` type. Who may send is the workspace permission system's
 * answer, passed in live. Reactions, read cursors, typing, live documents and attachments are
 * ports of their own, added as each wave lands; until then they are null and the pane offers
 * none of them, rather than controls that answer "not available here".
 */
import type { ValueStore } from '@/lib/value-store';
import type { GroupRestriction } from '@/components/chat/group-restriction';
import { describeFailure } from '@/lib/failure-message';
import { peerDisplayName } from '@/lib/peer-display';
import { chatFeatures, type StatedFeatures } from './features';
import { groupHistory, type GroupHistory } from './group-history';
import { pendingGroupSends, type PendingSends } from './pending-group-sends';
import type { NodeChatIO } from './node-chat-io';
import type { ChatMessage, ChatSelf, ChatTransport, SendPort, TextSend } from './chat-transport';

export interface NodeTransportParams {
  readonly channelId: string;
  /** The office's or room's name, as the pane says it ("Shared live with …"). */
  readonly channelName: string;
  readonly self: ChatSelf | null;
  readonly sendGate: ValueStore<GroupRestriction>;
  readonly io: NodeChatIO;
  /** A local id for a message being sent; the server's copy replaces it. */
  readonly mintLocalId: () => string;
  readonly now: () => number;
}

/**
 * What a node channel can do that no port says. The server holds its messages, so a per-message
 * security level and a retention window are not properties it has.
 */
export const NODE_FEATURES: StatedFeatures = {
  markdown: true, readReceipts: false, securityLevel: false, retention: false, optimistic: true, namesSenders: true,
};

/** `pending` holds the reader's unconfirmed copies; null sends and lets the server's copy appear. */
function nodeSend(params: NodeTransportParams, history: GroupHistory, pending: PendingSends | null): SendPort {
  const { io, self } = params;
  const deliver = (message: ChatMessage, kind: 'text' | 'markdown', replyTo: string | null): void => {
    io.send(message.content, kind, replyTo).catch((error: unknown): void => {
      // The bubble is the report: it says the send failed, why, and offers Retry.
      const failed: ChatMessage | null = pending?.update(message.id, { status: 'failed', error: describeFailure(error, 'The server did not take it.') }) ?? null;
      if (failed !== null) history.emit({ kind: 'updated', message: { id: failed.id, status: 'failed', error: failed.error } });
    });
  };
  return {
    text: async ({ content, messageType, replyTo, onRecorded }: TextSend): Promise<void> => {
      if (pending === null) {
        await io.send(content, messageType, replyTo);
        onRecorded();
        return;
      }
      if (self === null) throw new Error('This tab has not finished signing in, so the message was not sent.');
      const message: ChatMessage = {
        id: params.mintLocalId(), content, timestamp: params.now(), index: 0, status: 'pending', message_type: messageType,
        ...(replyTo !== null ? { replyTo } : {}),
        author: { own: true, name: self.displayName, username: null }, share: null,
      };
      pending.add(message, { content, reply_to: replyTo, message_type: messageType === 'markdown' ? 'Markdown' : 'Text' });
      history.emit({ kind: 'arrived', message, incoming: false });
      onRecorded();
      deliver(message, messageType, replyTo);
    },
    revise: { edit: io.edit, remove: io.remove },
    react: null,
    retry: async (messageId: string): Promise<void> => {
      const failed: ChatMessage | null = pending?.get(messageId) ?? null;
      if (failed === null || failed.status !== 'failed') return;
      pending?.update(messageId, { status: 'pending', error: undefined });
      history.emit({ kind: 'status', messageId, status: 'pending' });
      deliver(failed, failed.message_type === 'markdown' ? 'markdown' : 'text', failed.replyTo ?? null);
    },
  };
}

export function createNodeTransport(params: NodeTransportParams): ChatTransport {
  const { channelId, channelName, self, io } = params;
  // What the transport does follows what it states: optimistic means the reader's copy shows first.
  const pending: PendingSends | null = NODE_FEATURES.optimistic ? pendingGroupSends() : null;
  const history: GroupHistory = groupHistory({
    self, log: io.log, pages: { latest: io.latest, older: io.older }, pending,
    // Read cursors arrive with their wave; until then reading a channel leaves nothing to record.
    markRead: (): void => undefined,
    focus: io.focus,
    // The bell is already silent for an open channel (open-channel), so there is nothing to clear.
    clearNotices: (): void => undefined,
  });
  const ports: Pick<ChatTransport, 'send' | 'status' | 'files' | 'documents' | 'settings'> = {
    send: nodeSend(params, history, pending), status: null, files: null, documents: null, settings: null,
  };
  return {
    kind: 'node',
    conversationKey: `node:${channelId}`,
    self,
    counterpart: { name: channelName, username: null, greeting: `Start the conversation in ${channelName}. Messages are kept on the workspace server.` },
    features: chatFeatures(ports, NODE_FEATURES),
    sendGate: params.sendGate,
    history: history.port,
    ...ports,
    reactorName: (cid: bigint): string => (self !== null && cid === self.cid ? 'You' : peerDisplayName({ cid })),
  };
}
