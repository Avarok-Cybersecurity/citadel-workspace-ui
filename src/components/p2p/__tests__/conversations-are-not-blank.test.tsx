/**
 * A new conversation showed nothing at all.
 *
 * `P2PMessageList` rendered the loading hints and `messages.map(...)`, so with
 * zero messages the transcript area was empty -- the first conversation a new
 * user opens, which is the product's core flow, looked like a screen that had
 * failed to load. The group chat view has had "No messages yet" since it was
 * written; the two surfaces simply diverged.
 */

import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { P2PMessageList } from '../P2PMessageList';

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { content: string } }): JSX.Element => <div>{message.content}</div>,
}));

const base: Omit<ComponentProps<typeof P2PMessageList>, 'ref'> = {
  messages: [],
  currentUserCid: 1n,
  currentUserName: 'me',
  peerName: 'alice',
  peerCid: 2n,
  isLoadingMore: false,
    isLoadingHistory: false,
  hasMorePages: false,
  displaySenderName: false,
  displaySenderAvatar: false,
  onScroll: vi.fn(),
  onRetryMessage: vi.fn(),
  onOpenDocument: vi.fn(),
  onAcceptTransfer: vi.fn(),
  onDeclineTransfer: vi.fn(),
  onCancelTransfer: vi.fn(),
  onOpenFile: vi.fn(),
};

describe('an empty P2P conversation', () => {
  it('says it is empty, and who it is with', () => {
    render(<P2PMessageList {...base} />);

    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });

  it('shows the loading hint instead while the first page is arriving', () => {
    // An empty state during a fetch would say "no messages" about messages that
    // are on their way.
    render(<P2PMessageList {...base} isLoadingMore />);

    expect(screen.queryByText(/No messages yet/i)).toBeNull();
  });

  it('disappears once there is a message', () => {
    render(
      <P2PMessageList
        {...base}
        messages={[{ id: '1', content: 'hi', senderCid: 1n, timestamp: 0, status: 'sent' }] as never}
      />,
    );

    expect(screen.queryByText(/No messages yet/i)).toBeNull();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });
});

/**
 * The empty state is a STATEMENT, and it must not be made before the history is read.
 *
 * `isLoadingMore` is about pagination, so between opening a conversation and its stored
 * messages arriving, "No messages yet. Say hello to Bob" was printed over months of history —
 * on the product's core flow, every time.
 */
describe('the empty state waits until it is true', () => {
  it('says nothing while the history is still being read', () => {
    render(<P2PMessageList {...base} isLoadingHistory />);
    expect(screen.queryByText(/No messages yet/i), 'claimed the conversation was empty before reading it').toBeNull();
    expect(screen.queryByText(/Say hello/i)).toBeNull();
  });

  it('says it once the history is read and there is genuinely nothing', () => {
    render(<P2PMessageList {...base} isLoadingHistory={false} />);
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
  });

  it('never says it when there are messages, loading or not', () => {
    const withHistory = { ...base, messages: [{ id: 'm1', content: 'hello', senderCid: 2n, timestamp: 1, status: 'delivered' }] as never };
    render(<P2PMessageList {...withHistory} isLoadingHistory />);
    expect(screen.queryByText(/No messages yet/i)).toBeNull();
  });
});
