/**
 * A remount used to take the reader out of the conversation.
 *
 * `OfficeChatTabs` rendered `<Tabs defaultValue="content">`, which keeps the
 * selection in the component instance — and `BaseOffice` is keyed on the node
 * id precisely so React remounts it. Every one of those remounts put a user who
 * was reading a room's chat back on the Content document, mid-sentence, with no
 * action of their own and nothing on screen to explain it. The composer left
 * the DOM with it, which is what an integration run reports as
 * "WARNING: Message input not found".
 *
 * The file's own docstring already noted that inactive tab panels unmount —
 * that is why the call docks above them. The panels unmounting was known; the
 * SELECTION not surviving was not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forgetAllTabs } from '../office-tab-memory';

vi.mock('@/components/chat/GroupChatView', () => ({
  default: (): JSX.Element => <div data-testid="group-message-input" />,
}));
vi.mock('@/components/call/GroupCallControls', () => ({
  GroupCallControls: (): JSX.Element => <div />,
}));
vi.mock('@/components/call/GroupCallDock', () => ({
  GroupCallDock: (): JSX.Element => <div />,
}));
vi.mock('@/hooks/use-domain-call-members', () => ({
  useDomainCallMembers: (): unknown[] => [],
}));
vi.mock('@/hooks/use-permission', () => ({
  usePermission: (): { allowed: boolean; loading: boolean; unanswered: boolean } => ({
    allowed: true, loading: false, unanswered: false,
  }),
}));

const { OfficeChatTabs } = await import('../OfficeChatTabs');

function renderTabs(chatChannelId: string): ReturnType<typeof render> {
  return render(
    <OfficeChatTabs
      contentView={<div data-testid="the-document" />}
      chatChannelId={chatChannelId}
      nodeId="n1"
      roomName="Random"
      currentUserId="1"
      currentUserName="alice"
    />,
  );
}

describe('the office chat tab', () => {
  beforeEach((): void => { forgetAllTabs(); });

  it('opens on the document, and switches to chat', async () => {
    // The positive control: a component that always showed chat would satisfy
    // the remount test below while being wrong.
    const first: ReturnType<typeof render> = renderTabs('room-1');
    expect(screen.queryByTestId('group-message-input')).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: /chat/i }));
    expect(screen.queryByTestId('group-message-input')).toBeTruthy();
    first.unmount();
  });

  it('is still on chat after a remount', async () => {
    const first: ReturnType<typeof render> = renderTabs('room-1');
    await userEvent.click(screen.getByRole('tab', { name: /chat/i }));
    first.unmount();

    // What BaseOffice's `key={nodeId}` does on any node change.
    renderTabs('room-1');
    expect(screen.queryByTestId('group-message-input')).toBeTruthy();
  });

  it('remembers each room separately', async () => {
    const first: ReturnType<typeof render> = renderTabs('room-1');
    await userEvent.click(screen.getByRole('tab', { name: /chat/i }));
    first.unmount();

    // A different room was never opened on chat, so it opens on its document.
    // Without this, one global "last tab" would drag every room along with it.
    renderTabs('room-2');
    expect(screen.queryByTestId('group-message-input')).toBeNull();
    expect(screen.queryByTestId('the-document')).toBeTruthy();
  });
});
