/**
 * A group reply said only "Replying to a message".
 *
 * `reply_to` names the original, and the original is usually on screen -- but
 * the bubble never looked it up, so the reader could not tell which message a
 * reply answered. It now quotes the same way a P2P reply does, from the same
 * component, and says so when the original is not loaded.
 *
 * `useGroupChat` is replaced with its resting state plus the messages under
 * test: it talks to the server and the group store, and none of that decides
 * what a bubble quotes. The view and the message items render for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { GroupMessage } from '@/types/workspace-entities';
import { groupMessagesByDate } from '../shared';

let messages: GroupMessage[] = [];
const scrolled: string[] = [];

vi.mock('@/lib/connection', () => ({
  connectionManager: { getConnectionInfo: (): { cid: bigint; username: string } => ({ cid: 7n, username: 'self' }) },
}));
vi.mock('react-router-dom', () => ({ useNavigate: (): (() => void) => (): void => {} }));
vi.mock('../useGroupChat', () => ({
  useGroupChat: (): Record<string, unknown> => ({
    messages,
    messagesByDate: groupMessagesByDate(messages),
    loading: false, loadingMore: false, hasMore: false, sending: false,
    inputValue: '', setInputValue: (): void => {},
    editingId: null, setEditingId: (): void => {},
    editContent: '', setEditContent: (): void => {},
    replyToId: null, setReplyToId: (): void => {},
    handleKeyPress: (): void => {}, handleSendMessage: (): void => {},
    handleEditMessage: (): void => {}, handleDeleteMessage: (): void => {},
    loadMoreMessages: (): void => {},
    messagesEndRef: { current: null }, scrollAreaRef: { current: null },
  }),
}));

const { GroupChatView } = await import('../GroupChatView');

function groupMessage(id: string, sender: string, content: string, replyTo: string | null): GroupMessage {
  return {
    id, group_id: 'g1', sender_id: sender, sender_name: sender, message_type: 'Text' as GroupMessage['message_type'],
    content, timestamp: 1_700_000_000_000n, reply_to: replyTo, reply_count: 0, mentions: [], edited_at: null,
  };
}

function renderView(): void {
  render(<GroupChatView groupId="g1" currentUserName="self" sendRestriction="allowed" />);
}

beforeEach((): void => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element): void {
    scrolled.push(this.getAttribute('data-message-id') ?? '(no id)');
  };
});

describe('a group reply', () => {
  it('quotes the original author and line, and jumps to it', () => {
    messages = [
      groupMessage('g-q', 'bob', 'Who has the deck?', null),
      groupMessage('g-r', 'self', 'I do', 'g-q'),
    ];
    renderView();
    const quote: HTMLElement = screen.getByTestId('reply-quote');
    expect(within(quote).getByText('bob')).toBeInTheDocument();
    expect(within(quote).getByText('Who has the deck?')).toBeInTheDocument();
    expect(screen.queryByText('Replying to a message')).toBeNull();

    fireEvent.click(quote);
    expect(scrolled).toEqual(['g-q']);
  });

  it('says the original is not loaded when it is not', () => {
    messages = [groupMessage('g-r2', 'bob', 'Same here', 'older')];
    renderView();
    expect(screen.getByText('Original message not loaded')).toBeInTheDocument();
  });

  it('shows no quote on a message that is not a reply', () => {
    messages = [groupMessage('g-m', 'bob', 'Morning', null)];
    renderView();
    expect(screen.queryByTestId('reply-quote')).toBeNull();
    expect(screen.queryByTestId('reply-quote-missing')).toBeNull();
  });
});
