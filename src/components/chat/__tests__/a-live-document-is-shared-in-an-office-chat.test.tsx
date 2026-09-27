/**
 * An office or room chat shares a live document from its composer, with the box empty or
 * holding the title, and a LiveDocument message opens it.
 *
 * Real: the composer, the live-docs hook, the type bar and the message item. Stubbed: the
 * workspace service's share call, which is the network (its wire is pinned by the kernel's
 * a_live_document_is_kept_by_the_server.rs), and the chat hook's state, which the composer only
 * reads and sets.
 */
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkspaceService from '@/lib/workspace-service';
import type { GroupMessage } from '@/types/workspace-entities';
import { GroupComposer } from '../GroupComposer';
import { GroupMessageItem } from '../GroupMessageItem';
import { useGroupLiveDocs, UNTITLED_DOCUMENT, type GroupLiveDocs } from '../live-doc/use-group-live-docs';
import type { useGroupChat } from '../useGroupChat';
import type { OpenLiveDoc } from '../live-doc/GroupLiveDocCard';

type Chat = ReturnType<typeof useGroupChat>;
const OFFICE_CHANNEL: string = 'office-channel-1';
const PEER_GROUP: string = '12:34';

function fakeChat(inputValue: string): Chat {
  return {
    inputValue, setInputValue: vi.fn(), messageType: 'Text', setMessageType: vi.fn(),
    editingId: null, editContent: '', setEditContent: vi.fn(), sending: false,
    handleSendMessage: vi.fn(async () => {}), handleEditMessage: vi.fn(async () => {}), handleKeyPress: vi.fn(),
  } as unknown as Chat;
}

function Harness({ groupId, chat }: { groupId: string; chat: Chat }): JSX.Element {
  const liveDocs: GroupLiveDocs = useGroupLiveDocs(groupId);
  const ref: React.RefObject<HTMLTextAreaElement> = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <GroupComposer groupId={groupId} chat={chat} liveDocs={liveDocs} composerRef={ref} />
      {liveDocs.open && <p data-testid="opened">{liveDocs.open.title}</p>}
    </>
  );
}

let share: MockInstance<typeof WorkspaceService.shareLiveDoc>;
beforeEach(() => {
  share = vi.spyOn(WorkspaceService, 'shareLiveDoc').mockResolvedValue(undefined);
});

describe("an office chat's composer", () => {
  it('shares an untitled live document from an empty box, and opens it', async () => {
    const chat: Chat = fakeChat('');
    render(<Harness groupId={OFFICE_CHANNEL} chat={chat} />);
    fireEvent.click(screen.getByRole('button', { name: /live doc/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Share live document' }));
    await waitFor(() => expect(screen.getByTestId('opened').textContent).toBe(UNTITLED_DOCUMENT));
    expect(share).toHaveBeenCalledWith(OFFICE_CHANNEL, expect.any(String), UNTITLED_DOCUMENT);
    expect(chat.handleSendMessage).not.toHaveBeenCalled();
  });

  it('on Enter shares the typed title rather than sending it as a message', async () => {
    const chat: Chat = fakeChat('  Sprint plan ');
    render(<Harness groupId={OFFICE_CHANNEL} chat={chat} />);
    fireEvent.click(screen.getByRole('button', { name: /live doc/i }));
    fireEvent.keyDown(screen.getByTestId('group-message-input'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('opened').textContent).toBe('Sprint plan'));
    expect(chat.handleKeyPress).not.toHaveBeenCalled();
    expect(chat.setInputValue).toHaveBeenCalledWith('');
  });

  it('keeps the title when the server refuses, and opens nothing', async () => {
    share.mockRejectedValueOnce(new Error('this chat already has 32 live documents'));
    const chat: Chat = fakeChat('Plan');
    render(<Harness groupId={OFFICE_CHANNEL} chat={chat} />);
    fireEvent.click(screen.getByRole('button', { name: /live doc/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Share live document' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByTestId('opened')).toBeNull();
    expect(chat.setInputValue).not.toHaveBeenCalled();
  });

  it('is offered in a peer group too, whose members keep it', () => {
    render(<Harness groupId={PEER_GROUP} chat={fakeChat('')} />);
    expect(screen.getByRole('button', { name: /live doc/i })).toBeTruthy();
  });
});

describe('a LiveDocument message', () => {
  it('shows the document and opens it', () => {
    const onOpen: Mock<(doc: OpenLiveDoc) => void> = vi.fn();
    const message: GroupMessage = {
      id: 'm1', group_id: OFFICE_CHANNEL, sender_id: 'ada', sender_name: 'Ada', message_type: 'LiveDocument',
      content: 'Shared a live document: Plan', timestamp: 1n, reply_to: null, reply_count: 0, mentions: [],
      edited_at: null, document_id: 'd1', document_title: 'Plan',
    } as GroupMessage;
    render(
      <GroupMessageItem message={message} currentUserName="thomas" totalMembers={2} onEdit={vi.fn()} onDelete={vi.fn()}
        canRevise={false} onReply={vi.fn()} focusComposer={vi.fn()} quoted={null} onOpenDocument={onOpen} />,
    );
    fireEvent.click(screen.getByTestId('group-live-doc-open'));
    expect(onOpen).toHaveBeenCalledWith({ id: 'd1', title: 'Plan' });
    expect(screen.queryByText('Shared a live document: Plan')).toBeNull();
  });
});
