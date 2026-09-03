/**
 * Opening a peer group asked the workspace server for its history.
 *
 * `useGroupChat` calls `WorkspaceService.getGroupMessages(groupId)` on mount for
 * BOTH kinds of group. A peer group is owned by no node, so that server answers
 * "Permission denied: not a member of this chat channel" — and there is no
 * history to be had anywhere: `group-persistence` stores the group LIST, not
 * messages, and a Citadel message group is a live channel.
 *
 * So opening a peer group raised a destructive "Failed to load messages" toast
 * for a request that could only ever fail, then fell back to the empty state
 * once the loading deadline fired. Rounds 470 and 471 fixed the send and the
 * receive; this is the third place that assumed one kind of group.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const asked: string[] = [];
const toasts: Array<{ title?: string }> = [];

vi.mock('@/lib/workspace-service', () => ({
  default: {
    getGroupMessages: async (groupId: string): Promise<void> => { asked.push(groupId); },
    sendGroupMessage: async (): Promise<void> => {},
  },
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: (): { toast: (t: { title?: string }) => void } => ({
    toast: (t: { title?: string }): void => { toasts.push(t); },
  }),
}));
vi.mock('@/components/shared/confirm-dialog', () => ({
  useConfirm: (): (() => Promise<boolean>) => async (): Promise<boolean> => true,
}));
vi.mock('@/lib/group-messaging-manager', () => ({
  groupMessagingManager: {
    subscribeToGroup: (): (() => void) => (): void => {},
    getMessages: (): { messages: []; hasMore: boolean } => ({ messages: [], hasMore: false }),
    markLoadingOlder: (): void => {},
    clearLoadingOlder: (): void => {},
  },
}));

const { useGroupChat } = await import('../useGroupChat');

describe('opening a group', () => {
  beforeEach((): void => { asked.length = 0; toasts.length = 0; });

  it('does not ask the workspace server for a peer group it does not own', async () => {
    renderHook(() => useGroupChat('7:42'));

    await waitFor((): void => { expect(asked).toEqual([]); });
    expect(toasts).toEqual([]);
  });

  it('stops the spinner rather than leaving it to the deadline', async () => {
    const { result } = renderHook(() => useGroupChat('7:42'));

    await waitFor((): void => { expect(result.current.loading).toBe(false); });
  });

  it('still asks for a node-backed chat channel, which the server does own', async () => {
    // Positive control: the peer branch must not silence the workspace one.
    renderHook(() => useGroupChat('9f3c1e2a-0000-4000-8000-000000000001'));

    await waitFor((): void => {
      expect(asked).toEqual(['9f3c1e2a-0000-4000-8000-000000000001']);
    });
  });
});
