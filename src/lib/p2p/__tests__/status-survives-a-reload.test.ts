/**
 * Four paths treated the in-memory message window as the source of truth, and it
 * does not survive a reload: `loadFromStorage` restores every conversation with
 * `messages: []` and nothing rehydrates it. These are the two that a user hits
 * in the ordinary offline-peer flow.
 */
import { describe, it, expect, vi   } from 'vitest';
import { MessageAckHandler } from '../message-ack-handler';
import { MessageSender } from '../message-sender';
import type { P2PConversation } from '../p2p-types';

const PEER: bigint = 42n;

function ackHandlerWith(updateMessageInPages: ReturnType<typeof vi.fn>) {
  const notifyMessageStatusListeners: ReturnType<typeof vi.fn> = vi.fn();
  const handler: MessageAckHandler = new MessageAckHandler({
    // Empty, exactly as it is after a reload.
    getConversations: () => new Map<bigint, P2PConversation>(),
    updateMessageInPages,
    notifyMessageStatusListeners,
  } as unknown as ConstructorParameters<typeof MessageAckHandler>[0]);
  return { handler, notifyMessageStatusListeners };
}

describe('an ack for a message outside the in-memory window', () => {
  it('is applied to the stored page instead of being dropped', async () => {
    const updateMessageInPages: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<boolean> => true);
    const { handler, notifyMessageStatusListeners } = ackHandlerWith(updateMessageInPages);

    await handler.handleMessageAck(
      { message_id: 'm1', ack_type: 'read' } as never,
      PEER,
    );

    // Previously a debugLog and nothing else: the message stayed on one check
    // for ever even though the peer had read it.
    expect(updateMessageInPages).toHaveBeenCalledWith(PEER, 'm1', expect.objectContaining({ status: 'read' }));
    expect(notifyMessageStatusListeners).toHaveBeenCalledWith('m1', 'read');
  });

  it('does not claim an update when the message is in neither place', async () => {
    const updateMessageInPages: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<boolean> => false);
    const { handler, notifyMessageStatusListeners } = ackHandlerWith(updateMessageInPages);

    await handler.handleMessageAck({ message_id: 'gone', ack_type: 'read' } as never, PEER);

    expect(notifyMessageStatusListeners).not.toHaveBeenCalled();
  });
});

describe('retrying a failed message after a reload', () => {
  it('finds it in storage rather than throwing', async () => {
    const stored: { id: string; status: string; contents: string; } = { id: 'm2', status: 'failed', contents: 'hi' };
    const findStoredMessage: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<{ id: string; status: string; contents: string; }> => stored);
    const conversation: P2PConversation = { messages: [] } as unknown as P2PConversation;

    const sender: MessageSender = new MessageSender({
      findStoredMessage,
      updateMessageInPages: vi.fn(async () => true),
      notifyMessageStatusListeners: vi.fn(),
      isConnected: () => true,
      tryEnsurePeerReady: async () => true,
      getCurrentCid: async () => 1n,
      getOrCreateConversation: () => conversation,
      addMessageToConversation: vi.fn(async () => true),
      notifyMessageListeners: vi.fn(),
      emitEvent: vi.fn(),
      sendRawMessage: vi.fn(async () => {}),
    } as unknown as ConstructorParameters<typeof MessageSender>[0]);

    // The throw was unconditional before: the retry affordance was rendered from
    // the page store while the lookup searched an empty array.
    await sender.resendMessage(PEER, 'm2', conversation).catch(() => undefined);

    expect(findStoredMessage).toHaveBeenCalledWith(PEER, 'm2');
  });

  it('still reports a genuinely unknown message', async () => {
    const conversation: P2PConversation = { messages: [] } as unknown as P2PConversation;
    const sender: MessageSender = new MessageSender({
      findStoredMessage: vi.fn(async () => null),
      getOrCreateConversation: () => conversation,
    } as unknown as ConstructorParameters<typeof MessageSender>[0]);

    await expect(sender.resendMessage(PEER, 'nope', conversation)).rejects.toThrow(/not found/);
  });
});

describe('opening a conversation after a reload', () => {
  it('sends read receipts for the messages actually on screen', async () => {
    const stored: { id: string; senderCid: bigint; status: string; }[] = [
      { id: 'a', senderCid: PEER, status: 'delivered' },
      { id: 'b', senderCid: PEER, status: 'delivered' },
    ];
    vi.resetModules();
    vi.doMock('../message-pagination-store', () => ({
      messagePaginationStore: {
        findUnreadFromPeer: vi.fn(async () => stored),
        updateMessageInPages: vi.fn(async () => true),
        updateUnreadCount: vi.fn(async () => {}),
      },
    }));
    const conversationManager: { getConversation: () => { messages: never[]; unreadCount: number; }; } = {
      // Empty, exactly as after a reload — while the transcript on screen came
      // from the page store.
      getConversation: (): { messages: never[]; unreadCount: number; } => ({ messages: [], unreadCount: 2 }),
    };
    const { markMessagesAsRead } = await import('../messenger-compatibility');

    const sendMessageAck: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => {});
    await markMessagesAsRead(
      conversationManager as never,
      sendMessageAck,
      vi.fn(),
      PEER,
    );

    // Previously zero: the badge cleared while the sender's bubbles stayed on
    // 'delivered' for ever.
    expect(sendMessageAck).toHaveBeenCalledTimes(2);
    expect(sendMessageAck).toHaveBeenCalledWith('a', 'read', PEER);
  });
});
