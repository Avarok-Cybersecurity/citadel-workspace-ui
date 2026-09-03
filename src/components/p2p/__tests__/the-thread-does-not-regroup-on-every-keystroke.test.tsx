/**
 * The P2P thread re-grouped every message in the conversation on every keystroke.
 *
 * `inputMessage` is a controlled prop lifted into `P2PChat`, so typing a
 * character re-renders the whole chat — including `P2PMessageList`, which called
 * `groupMessagesByDate(messages)` inline in its render. That walks the entire
 * conversation and allocates a fresh object plus a fresh array per day, on every
 * key press, for a list that has not changed.
 *
 * Its twin has had the fix since it was written: `useGroupChat.ts:211` wraps the
 * identical call in `useMemo([messages])`. The group-chat view was made fast and
 * the P2P view — the product's core flow — was not.
 *
 * This counts real calls rather than asserting on the source, because `useMemo`
 * with the wrong dependency array compiles, reads correctly, and memoises
 * nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const groupings: number[] = [];

vi.mock('@/components/chat/shared', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    groupMessagesByDate: (messages: Array<{ timestamp: number }>): Record<string, unknown[]> => {
      groupings.push(messages.length);
      return { '2026-01-01': messages };
    },
  };
});
vi.mock('../bubbles', () => ({ MessageBubble: (): null => null }));
vi.mock('@/components/chat/shared/DateSeparator', () => ({ DateSeparator: (): null => null }));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

const { P2PMessageList }: typeof import('../P2PMessageList') = await import('../P2PMessageList');

interface Msg { id: string; timestamp: number; senderCid: bigint }

function messages(n: number): Msg[] {
  return Array.from({ length: n }, (_, i) => ({ id: `m${i}`, timestamp: i, senderCid: 7n }));
}

type ListProps = React.ComponentProps<typeof P2PMessageList>;

function listProps(msgs: Msg[]): ListProps {
  return {
    messages: msgs,
    currentUserCid: 1n,
    currentUserName: 'me',
    peerName: 'bob',
    peerCid: 7n,
    isLoadingMore: false,
    hasMorePages: false,
    displaySenderName: false,
    displaySenderAvatar: false,
    onScroll: (): void => {},
    onRetryMessage: (): void => {},
    onOpenDocument: (): void => {},
    onAcceptTransfer: (): void => {},
    onDeclineTransfer: (): void => {},
    onCancelTransfer: (): void => {},
    onOpenFile: (): void => {},
  } as unknown as ListProps;
}

describe('the P2P thread', () => {
  beforeEach((): void => { groupings.length = 0; });

  it('does not regroup when the parent re-renders with the same messages', () => {
    // A keystroke: the parent re-renders, the message list is untouched.
    const msgs: Msg[] = messages(200);
    const { rerender }: ReturnType<typeof render> = render(<P2PMessageList {...listProps(msgs)} />);
    const afterFirst: number = groupings.length;
    expect(afterFirst, 'the list never grouped at all').toBeGreaterThan(0);

    for (let i: number = 0; i < 10; i++) {
      rerender(<P2PMessageList {...listProps(msgs)} />);
    }

    expect(
      groupings.length,
      'ten keystrokes regrouped the whole conversation ten times',
    ).toBe(afterFirst);
  });

  it('does regroup when a message actually arrives', () => {
    // The opposite failure: a dependency array that never invalidates would pass
    // the assertion above and show a stale thread for ever.
    const msgs: Msg[] = messages(3);
    const { rerender }: ReturnType<typeof render> = render(<P2PMessageList {...listProps(msgs)} />);
    const afterFirst: number = groupings.length;

    rerender(<P2PMessageList {...listProps([...msgs, { id: 'new', timestamp: 9, senderCid: 7n }])} />);

    expect(groupings.length, 'a new message did not reach the thread').toBeGreaterThan(afterFirst);
    expect(groupings[groupings.length - 1]).toBe(4);
  });
});
