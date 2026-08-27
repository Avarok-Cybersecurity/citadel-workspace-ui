/**
 * A redelivered message must not become two messages.
 *
 * ILM can deliver the same inbound message again after a reload — its
 * delivered-set is memory-only, and a message still in the persisted inbound map
 * at restart is delivered afresh. The dedup upstream cannot catch it: the
 * in-memory conversation window is capped at 100 entries and comes back EMPTY
 * after a reload. The page store then appended blind, and the render-side merge
 * dedups ACROSS batches but not WITHIN one — so both copies rendered, for ever.
 *
 * The guard sits at the store, which is the common exit of every path that can
 * produce a duplicate.
 */
import { describe, it, expect, vi } from 'vitest';
import { placeInPage, recordAppend } from '../message-page-append';
import type { MessagePage, ConversationMetadata, P2PMessage } from '../p2p-types';

const message = (id: string, t: number): P2PMessage =>
  ({ id, timestamp: t, index: 1, senderCid: 7n, status: 'delivered' } as unknown as P2PMessage);

function emptyPage(): MessagePage {
  return {
    messages: [],
    pageTimestamps: { minTimestamp: 0, maxTimestamp: 0 },
  } as unknown as MessagePage;
}

function emptyMetadata(): ConversationMetadata {
  return {
    totalMessageCount: 0,
    oldestMessageTimestamp: 0,
    newestMessageTimestamp: 0,
    lastMessageIndex: 0,
    unreadCount: 0,
    lastUpdated: 0,
  } as unknown as ConversationMetadata;
}

describe('placeInPage', () => {
  it('keeps the page in timestamp order and re-derives its bounds', () => {
    const page = emptyPage();
    placeInPage(page, message('b', 20));
    placeInPage(page, message('a', 10));

    expect(page.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(page.pageTimestamps.minTimestamp).toBe(10);
    expect(page.pageTimestamps.maxTimestamp).toBe(20);
  });
});

describe('recordAppend', () => {
  it('counts a peer message as unread', () => {
    const metadata = emptyMetadata();
    recordAppend(metadata, message('a', 10), true, 99n);
    expect(metadata.unreadCount).toBe(1);
    expect(metadata.totalMessageCount).toBe(1);
  });

  it('does not count the user\'s own message as unread', () => {
    const metadata = emptyMetadata();
    recordAppend(metadata, message('a', 10), true, 7n);
    expect(metadata.unreadCount).toBe(0);
  });

  it('never moves the oldest timestamp forward on a later message', () => {
    const metadata = emptyMetadata();
    recordAppend(metadata, message('a', 10), true, 99n);
    recordAppend(metadata, message('b', 20), false, 99n);
    expect(metadata.oldestMessageTimestamp).toBe(10);
    expect(metadata.newestMessageTimestamp).toBe(20);
  });
});

/**
 * The guard itself, at the store. The helpers above are correct and would stay
 * correct with the dedup removed — this is the assertion that actually fails
 * when a redelivered message is appended twice.
 */
describe('appendMessageToPage', () => {
  it('writes a redelivered message once', async () => {
    vi.resetModules();

    const pages = new Map<string, MessagePage>();
    let metadata: ConversationMetadata | undefined;

    vi.doMock('../message-page-operations', () => ({
      loadMetadataByKey: vi.fn(async () => null),
      loadMetadata: vi.fn(async () => metadata ?? null),
      tryLoadMetadata: vi.fn(async () => ({ found: metadata !== undefined, value: metadata ?? null })),
      saveMetadata: vi.fn(async (_cid: bigint, m: ConversationMetadata) => { metadata = m; }),
      loadMessagePage: vi.fn(async (_cid: bigint, n: number) => pages.get(String(n)) ?? null),
      tryLoadMessagePage: vi.fn(async (_cid: bigint, n: number) => ({
        found: pages.has(String(n)),
        value: pages.get(String(n)) ?? null,
      })),
      saveMessagePage: vi.fn(async (_cid: bigint, n: number, p: MessagePage) => { pages.set(String(n), p); }),
      deleteConversationPages: vi.fn(async () => {}),
      loadAllMetadata: vi.fn(async () => []),
      deleteOldFormat: vi.fn(async () => {}),
    }));

    const { messagePaginationStore } = await import('../message-pagination-store');
    const inbound = message('redelivered-1', 10);

    await messagePaginationStore.appendMessageToPage(7n, inbound, async () => 99n, () => 'peer');
    await messagePaginationStore.appendMessageToPage(7n, inbound, async () => 99n, () => 'peer');

    const stored = [...pages.values()].flatMap((p) => p.messages);
    expect(stored.filter((m) => m.id === 'redelivered-1')).toHaveLength(1);
    // And the unread badge must not count it twice either.
    expect(metadata?.unreadCount).toBe(1);
    expect(metadata?.totalMessageCount).toBe(1);

    vi.doUnmock('../message-page-operations');
  });
});
