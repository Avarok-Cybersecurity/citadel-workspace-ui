/**
 * Sending into a peer group put nothing on your own screen.
 *
 * The workspace path relies on an echo: the server answers the SENDER with the
 * same `GroupMessageNotification` it broadcasts to everyone else, which is what
 * puts your message in your own transcript — `await-write-response.ts` says so
 * in as many words.
 *
 * The peer wire does not echo. `requests/group/message.rs` answers the sender
 * with `GroupMessageSuccess { cid, group_key, request_id }` — no content — and
 * broadcasts the body to the group. So after rounds 470-473 a peer-group
 * message reached everyone except the person who sent it: you typed, pressed
 * send, the composer cleared, and nothing appeared.
 *
 * The id matters here too. The local copy carries the id the sender minted, so
 * if an echo ever does arrive, `handleNewMessage` dedupes it rather than
 * printing the message twice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const delivered: Array<{ groupId: string; id: string; content: string }> = [];
const sentIds: string[] = [];

vi.mock('@/lib/workspace-service', () => ({
  default: {
    getGroupMessages: async (): Promise<void> => {},
    sendGroupMessage: async (): Promise<void> => {},
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: (): { toast: () => void } => ({ toast: (): void => {} }) }));
vi.mock('@/components/shared/confirm-dialog', () => ({
  useConfirm: (): (() => Promise<boolean>) => async (): Promise<boolean> => true,
}));
vi.mock('@/lib/group-messaging-manager', () => ({
  groupMessagingManager: {
    subscribeToGroup: (): (() => void) => (): void => {},
    getMessages: (): { messages: []; hasMore: boolean } => ({ messages: [], hasMore: false }),
    markLoadingOlder: (): void => {},
    clearLoadingOlder: (): void => {},
    handleNewMessage: (groupId: string, message: { id: string; content: string }): void => {
      delivered.push({ groupId, id: message.id, content: message.content });
    },
  },
}));
// Mocked at the wire, not at the unit under test: sendGroupMessageAnywhere is
// what decides to place the local copy, and mocking that would test nothing.
vi.mock('@/lib/group-conversations/group-requests', () => ({
  sendPeerGroupMessage: async (_g: string, _c: string, _r?: string): Promise<string> => {
    const id: string = 'minted-1';
    sentIds.push(id);
    return id;
  },
}));

const { useGroupChat } = await import('../useGroupChat');

describe('sending into a peer group', () => {
  beforeEach((): void => { delivered.length = 0; sentIds.length = 0; });

  it('puts your own message on your own screen', async () => {
    const { result } = renderHook(() => useGroupChat('7:42'));

    act((): void => { result.current.setInputValue('hello'); });
    await act(async (): Promise<void> => { await result.current.handleSendMessage(); });

    await waitFor((): void => {
      expect(delivered).toEqual([{ groupId: '7:42', id: 'minted-1', content: 'hello' }]);
    });
  });

  it('uses the id the send minted, so an echo would not duplicate it', async () => {
    const { result } = renderHook(() => useGroupChat('7:42'));

    act((): void => { result.current.setInputValue('hello'); });
    await act(async (): Promise<void> => { await result.current.handleSendMessage(); });

    await waitFor((): void => { expect(delivered[0]?.id).toBe(sentIds[0]); });
  });
});
