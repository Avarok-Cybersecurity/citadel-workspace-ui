/**
 * Opening a peer group asked the workspace server for its history.
 *
 * `useGroupChat` calls `WorkspaceService.getGroupMessages(groupId)` on mount for
 * BOTH kinds of group. A peer group is owned by no node, so that server answers
 * "Permission denied: not a member of this chat channel" — and the server holds
 * no history for it: a Citadel message group is a live channel, and its history
 * is the local transcript (see a-peer-group-keeps-its-history).
 *
 * So opening a peer group raised a destructive "Failed to load messages" toast
 * for a request that could only ever fail, then fell back to the empty state
 * once the loading deadline fired. Rounds 470 and 471 fixed the send and the
 * receive; this is the third place that assumed one kind of group.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const asked: string[] = [];
const restored: string[] = vi.hoisted((): string[] => []);
const toasts: Array<{ title?: string }> = [];

vi.mock('@/lib/workspace-service', () => ({
  default: {
    getGroupMessages: async (groupId: string): Promise<void> => { asked.push(groupId); },
    sendGroupMessage: async (): Promise<void> => {},
  },
}));
// The store itself is covered by a-peer-group-keeps-its-history; what is asked
// here is only whether opening the group reads it back.
vi.mock('@/lib/group-conversations/group-transcript-store', () => ({
  restoreGroupTranscript: async (groupId: string): Promise<void> => { restored.push(groupId); },
}));
// One function for every render, as the real hook returns: `toast` is an
// effect dependency, and a fresh one per render re-runs the load forever.
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { title?: string }): void => { toasts.push(t); };
  return { useToast: (): { toast: (t: { title?: string }) => void } => ({ toast }) };
});
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
  beforeEach((): void => { asked.length = 0; restored.length = 0; toasts.length = 0; });

  it('does not ask the workspace server for a peer group it does not own', async () => {
    renderHook(() => useGroupChat('7:42'));

    await waitFor((): void => { expect(asked).toEqual([]); });
    expect(toasts).toEqual([]);
  });

  it('reads its local transcript back instead, so history survives a reload', async () => {
    const { result } = renderHook(() => useGroupChat('7:42'));

    await waitFor((): void => { expect(result.current.loading).toBe(false); });
    expect(restored).toEqual(['7:42']);
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
    expect(restored, 'a server-backed channel has no local transcript').toEqual([]);
  });
});
