/**
 * Reacting in a peer group: your own reaction appears in the open thread (the
 * peer wire does not echo a body to its sender, so nothing else would put it
 * there) and the members are sent a reaction envelope -- never a chat body.
 *
 * The messaging manager, the thread hook and the reaction module run for real.
 * Mocked: the wire (`group-requests`, captured instead of sent), storage (a Map;
 * jsdom has no IndexedDB), the signed-in account, and the workspace service,
 * which a peer group never reaches.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { decodeGroupReaction, type PeerGroupReaction } from '@/lib/group-conversations/group-reaction-codec';
import { decodeGroupMessage } from '@/lib/group-conversations/group-message-codec';

const world: { sent: Uint8Array[]; store: Map<string, unknown> } = vi.hoisted(() => ({ sent: [], store: new Map<string, unknown>() }));

vi.mock('@/lib/storage-utils', () => ({
  dbGet: async (_s: string, k: string): Promise<unknown> => (world.store.has(k) ? structuredClone(world.store.get(k)) : undefined),
  dbPut: async (_s: string, k: string, v: unknown): Promise<void> => { world.store.set(k, structuredClone(v)); },
}));
vi.mock('@/lib/multi-instance/instance-manager', () => ({ instanceManager: { cid: 99n } }));
vi.mock('@/lib/workspace-service', () => ({ default: { getGroupMessages: async (): Promise<void> => {} } }));
// One toast for the life of the test. useGroupChat's load effect depends on
// `toast`, so a mock minting a new one per render re-runs the load on every
// render -- an endless restore loop that also masked whether the reaction
// event itself updates the thread.
const stableToast: () => void = vi.hoisted(() => (): void => {});
vi.mock('@/hooks/use-toast', () => ({ useToast: (): { toast: () => void } => ({ toast: stableToast }), toast: stableToast }));
vi.mock('@/components/shared/confirm-dialog', () => ({ useConfirm: (): (() => Promise<boolean>) => async (): Promise<boolean> => true }));
vi.mock('@/lib/group-conversations/group-requests', () => ({
  sendPeerGroupBody: async (_g: string, encode: (cid: bigint, id: string) => Uint8Array): Promise<string> => {
    world.sent.push(encode(99n, 'envelope-1'));
    return 'envelope-1';
  },
}));

const { useGroupChat } = await import('../useGroupChat');
const { deliverPeerGroupMessage } = await import('@/lib/group-conversations/peer-group-delivery');
const { reactInGroup } = await import('@/lib/group-conversations/group-reactions');

describe('reacting in a peer group', () => {
  it('shows your reaction in the thread and sends a reaction envelope', async () => {
    const { result } = renderHook(() => useGroupChat('7:42'));
    act((): void => {
      deliverPeerGroupMessage({ groupId: '7:42', messageId: 'm1', senderId: '7', senderName: 'ada', content: 'hi', timestamp: 1 });
    });
    await waitFor((): void => { expect(result.current.messages.map((m) => m.id)).toEqual(['m1']); });

    await act(async (): Promise<void> => { await reactInGroup('7:42', 'm1', '👍'); });

    await waitFor((): void => {
      expect(result.current.messages[0].reactions?.map((r) => [r.emoji, r.reactorCid, r.active])).toEqual([['👍', 99n, true]]);
    });
    const envelope: PeerGroupReaction | null = decodeGroupReaction(world.sent[0]);
    expect(envelope?.reaction).toMatchObject({ target_id: 'm1', emoji: '👍', active: true });
    expect(decodeGroupMessage(world.sent[0])).toBeNull();
  });
});
