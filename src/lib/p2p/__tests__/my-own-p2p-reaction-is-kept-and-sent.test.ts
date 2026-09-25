/**
 * Reacting to a P2P message: stored before it is sent, sent as the reaction
 * variant, and a second press takes it back.
 *
 * Same ordering contract as editing (messenger-revision): a storage failure
 * must stop the send, or the peer holds a reaction our own reload loses.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { P2PMessage } from '../p2p-types';
import type { MessagingLayer } from '@/types/messaging-layer';

const PEER: bigint = 777n;
const OWNER: bigint = 4242n;
const world: { pageWrite: boolean; pages: Map<string, Partial<P2PMessage>> } = vi.hoisted(() => ({
  pageWrite: true, pages: new Map<string, Partial<P2PMessage>>(),
}));

vi.mock('../current-cid', () => ({ getCurrentCid: async (): Promise<bigint> => 4242n }));
// The page store is covered for real in a-p2p-reaction-reaches-the-peer; here
// only whether it SUCCEEDED matters, so it is a recorder that can be told to fail.
vi.mock('../message-pagination-store', () => ({
  messagePaginationStore: {
    updateMessageInPages: async (_peer: bigint, id: string, u: Partial<P2PMessage>): Promise<boolean> => {
      if (world.pageWrite) world.pages.set(id, u);
      return world.pageWrite;
    },
  },
}));

const { reactToMessage } = await import('../messenger-reaction');

let conversation: { messages: P2PMessage[] };
let sent: MessagingLayer[];
const manager: Record<string, unknown> = { getConversation: () => conversation };
const send = async (_peer: bigint, layer: MessagingLayer): Promise<void> => { sent.push(layer); };
const press = (emoji: string): Promise<void> => reactToMessage(manager as never, (): void => {}, send, PEER, 'm1', emoji);

beforeEach(() => {
  world.pageWrite = true;
  world.pages.clear();
  sent = [];
  conversation = { messages: [{ id: 'm1', content: 'hi', senderCid: PEER, recipientCid: OWNER, timestamp: 1, index: 0, status: 'delivered', message_type: 'text' }] };
});

describe('my own reaction', () => {
  it('is stored with the message and sent as a MessageReaction', async () => {
    await press('🎉');
    expect(world.pages.get('m1')?.reactions?.map((r) => [r.emoji, r.reactorCid, r.active])).toEqual([['🎉', OWNER, true]]);
    expect(sent.map((l) => [l.type, (l as { emoji?: string }).emoji, (l as { active?: boolean }).active])).toEqual([['MessageReaction', '🎉', true]]);
  });

  it('is taken back by a second press', async () => {
    await press('🎉');
    await press('🎉');
    expect(sent.map((l) => (l as { active?: boolean }).active)).toEqual([true, false]);
    expect(conversation.messages[0].reactions?.filter((r) => r.active)).toEqual([]);
  });

  it('is not sent when it could not be stored', async () => {
    world.pageWrite = false;
    await expect(press('🎉')).rejects.toThrow(/Nothing was sent/);
    expect(sent).toEqual([]);
  });
});
