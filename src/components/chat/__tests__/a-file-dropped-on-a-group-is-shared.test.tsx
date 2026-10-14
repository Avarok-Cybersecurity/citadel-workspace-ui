/**
 * Dropping a file on a peer group's conversation shares it with the group.
 *
 * Owner, 2026-10-14: direct chats and the file manager took dropped files; a group chat only had
 * the paperclip. The drop now goes through the same share path as the paperclip
 * (useGroupFileShare.ts), and a node-backed channel, which has no file path on its server, claims
 * the drag and says so rather than letting the browser open the file.
 *
 * MOCKS, and why: `sendGroupFile` offers the file to every member over the agent's socket, which a
 * unit test does not have, so it is recorded rather than run. `useGroupChat` is its resting state,
 * as in load-older-is-offered-only-where-it-loads.test.tsx (it talks to the server and the group
 * store, and neither decides whether a drop is taken). The view, the drop target and the share
 * hook run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/connection', () => ({
  connectionManager: { getConnectionInfo: (): { cid: bigint; username: string } => ({ cid: 7n, username: 'self' }) },
}));
vi.mock('react-router-dom', () => ({ useNavigate: (): (() => void) => (): void => {} }));
vi.mock('../useGroupChat', () => ({
  useGroupChat: (): Record<string, unknown> => ({
    messages: [], messagesByDate: {},
    loading: false, loadingMore: false, hasMore: false, sending: false,
    inputValue: '', setInputValue: (): void => {},
    editingId: null, setEditingId: (): void => {},
    editContent: '', setEditContent: (): void => {},
    replyToId: null, setReplyToId: (): void => {},
    handleKeyPress: (): void => {}, handleSendMessage: (): void => {},
    handleEditMessage: (): void => {}, handleDeleteMessage: (): void => {},
    loadMoreMessages: (): void => {},
    stick: { unseen: 0, viewLatest: (): void => {}, reveal: (): void => {} }, scrollAreaRef: { current: null },
  }),
}));
const shared: Array<{ groupId: string; file: File }> = [];
vi.mock('@/lib/group-conversations/send-group-file', () => ({
  sendGroupFile: async (groupId: string, file: File): Promise<void> => { shared.push({ groupId, file }); },
}));

const { GroupChatView } = await import('../GroupChatView');

const FILE: File = new File(['hello'], 'plan.txt', { type: 'text/plain' });
const filesDrag: { dataTransfer: { types: string[]; files: File[] } } = { dataTransfer: { types: ['Files'], files: [FILE] } };

function renderGroup(groupId: string): void {
  render(<GroupChatView groupId={groupId} currentUserName="self" sendRestriction="allowed" totalMembers={null} />);
}

describe('a file dropped on a group conversation', () => {
  beforeEach(() => { shared.length = 0; });

  it('is shared with a peer group, through the paperclip\'s path', async () => {
    renderGroup('7:42');
    const chat: HTMLElement = screen.getByTestId('group-chat');
    fireEvent.dragEnter(chat, filesDrag);
    expect(screen.getByTestId('chat-drop-overlay')).toHaveTextContent('Drop a file to send it to everyone in the group');
    fireEvent.drop(chat, filesDrag);
    await waitFor(() => expect(shared).toEqual([{ groupId: '7:42', file: FILE }]));
    expect(screen.getByTestId('group-attach-file')).toBeInTheDocument();
  });

  it('is refused, with the reason, in a node-backed channel', async () => {
    renderGroup('9f3c1e2a-0000-4000-8000-000000000001');
    const chat: HTMLElement = screen.getByTestId('group-chat');
    fireEvent.dragEnter(chat, filesDrag);
    expect(screen.getByTestId('chat-drop-overlay')).toHaveTextContent('Files can be shared in peer groups, not in this channel');
    fireEvent.drop(chat, filesDrag);
    await new Promise<void>((r: () => void) => { setTimeout(r, 20); });
    expect(shared).toEqual([]);
    expect(screen.queryByTestId('group-attach-file')).toBeNull();
  });
});
