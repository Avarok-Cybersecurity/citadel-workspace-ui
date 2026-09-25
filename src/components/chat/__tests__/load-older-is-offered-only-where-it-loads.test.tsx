/**
 * "Load older messages" was shown in a peer group, where it can load nothing:
 * older pages come from the workspace server, which holds none for a group no
 * node owns, and `loadMoreMessages` returns early for one.
 *
 * `useGroupChat` is replaced with its resting state and `hasMore: true` -- the
 * very state that showed the button -- because it talks to the server and the
 * group store, and neither decides whether the control is offered. The view and
 * `groupMessageActions` run for real.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/connection', () => ({
  connectionManager: { getConnectionInfo: (): { cid: bigint; username: string } => ({ cid: 7n, username: 'self' }) },
}));
vi.mock('react-router-dom', () => ({ useNavigate: (): (() => void) => (): void => {} }));
vi.mock('../useGroupChat', () => ({
  useGroupChat: (): Record<string, unknown> => ({
    messages: [], messagesByDate: {},
    loading: false, loadingMore: false, hasMore: true, sending: false,
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

function renderGroup(groupId: string): void {
  render(<GroupChatView groupId={groupId} currentUserName="self" sendRestriction="allowed" />);
}

describe('"Load older messages"', () => {
  it('is not offered in a peer group, which has no older page anywhere', () => {
    renderGroup('7:42');
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();
  });

  it('is still offered in a node-backed channel, whose server pages', () => {
    // Positive control: without it the test above passes for a view that
    // never renders the button at all.
    renderGroup('9f3c1e2a-0000-4000-8000-000000000001');
    expect(screen.getByRole('button', { name: 'Load older messages' })).toBeInTheDocument();
  });
});
