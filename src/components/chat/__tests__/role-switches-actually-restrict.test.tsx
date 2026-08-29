/**
 * A permission switch that governs nothing is worse than no switch.
 *
 * `GroupPermissions` has eight keys, the role editor renders a labelled switch
 * for every one, and `formatPermissions` summarises them on the role list. Two
 * of the eight were read by nothing:
 *
 *   - `sendMessages` -- the only group composer's caller hardcoded
 *     `canSendMessages={true}`, so a "Muted" role sent messages anyway.
 *   - `viewMemberList` -- the chat header, the settings roster and the sidebar
 *     row all rendered the membership unconditionally.
 *
 * Group roles are entirely client-side state, so there is no server behind them
 * to enforce what the client declines to. The role's own settings page stated a
 * restriction that was not true.
 *
 * Each test carries its positive control: the permitted role must show the
 * thing, or "hidden when denied" would pass on a component that renders nothing
 * either way.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import type { GroupConversation } from '@/types/group';
import type { GroupPermissions } from '@/types/group-permissions';
import { DEFAULT_MEMBER_PERMISSIONS } from '@/types/group-permissions';

const SELF: bigint = 7n;
const OWNER: bigint = 99n;

vi.mock('@/lib/connection', () => ({
  connectionManager: {
    getConnectionInfo: (): { cid: bigint; username: string } => ({ cid: SELF, username: 'self' }),
  },
}));

/**
 * The composer's own state. Only the fields the view reads are supplied; none
 * of the handlers is exercised, since these assertions are about what renders.
 */
vi.mock('../useGroupChat', () => ({
  useGroupChat: (): Record<string, unknown> => ({
    messages: [],
    messagesByDate: {},
    loading: false,
    loadingMore: false,
    hasMore: false,
    sending: false,
    inputValue: '',
    setInputValue: (): void => {},
    editingId: null,
    setEditingId: (): void => {},
    editContent: '',
    setEditContent: (): void => {},
    replyToId: null,
    setReplyToId: (): void => {},
    handleKeyPress: (): void => {},
    handleSendMessage: (): void => {},
    handleEditMessage: (): void => {},
    handleDeleteMessage: (): void => {},
    loadMoreMessages: (): void => {},
    messagesEndRef: { current: null },
    scrollAreaRef: { current: null },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: (): (() => void) => (): void => {},
}));

/**
 * A group in which the current user holds a role with exactly `permissions`.
 * The owner is somebody else, because `isOwner` short-circuits to every
 * permission and would mask whatever the role says.
 */
function groupWhereSelfHas(permissions: GroupPermissions): GroupConversation {
  return {
    id: 'g1',
    name: 'Design',
    ownerId: OWNER,
    members: [
      { cid: OWNER, username: 'owner', roleId: 'owner-role', joinedAt: 1 },
      { cid: SELF, username: 'self', roleId: 'member-role', joinedAt: 2 },
    ],
    settings: {
      defaultRoleId: 'member-role',
      roles: [
        { id: 'owner-role', name: 'Owner', color: '#fff', position: 10, isBuiltIn: true, permissions: DEFAULT_MEMBER_PERMISSIONS },
        { id: 'member-role', name: 'Member', color: '#fff', position: 1, isBuiltIn: true, permissions },
      ],
    },
  } as unknown as GroupConversation;
}

const MUTED: GroupPermissions = { ...DEFAULT_MEMBER_PERMISSIONS, sendMessages: false };
const BLINDED: GroupPermissions = { ...DEFAULT_MEMBER_PERMISSIONS, viewMemberList: false };

describe('the viewMemberList switch', () => {
  it('hides the roster in the chat header, and shows it when permitted', async () => {
    const { GroupChatHeader } = await import('../GroupChatHeader');

    const permitted: ReturnType<typeof render> = render(
      <GroupChatHeader
        group={groupWhereSelfHas(DEFAULT_MEMBER_PERMISSIONS)}
        onOpenSettings={(): void => {}}
        onLeaveGroup={async (): Promise<void> => {}}
      />,
    );
    // Positive control: without this, "not shown when denied" is trivially true.
    expect(permitted.container.textContent).toContain('2 members');
    permitted.unmount();

    const denied: ReturnType<typeof render> = render(
      <GroupChatHeader
        group={groupWhereSelfHas(BLINDED)}
        onOpenSettings={(): void => {}}
        onLeaveGroup={async (): Promise<void> => {}}
      />,
    );
    expect(denied.container.textContent).not.toContain('2 members');
  });

  it('replaces the settings roster with the reason', async () => {
    const { GroupMemberManagement } = await import('../GroupMemberManagement');

    const permitted: ReturnType<typeof render> = render(
      <GroupMemberManagement
        group={groupWhereSelfHas(DEFAULT_MEMBER_PERMISSIONS)}
        onRoleChange={async (): Promise<void> => {}}
        onKickMember={async (): Promise<void> => {}}
      />,
    );
    expect(permitted.container.textContent).toContain('Members (2)');
    permitted.unmount();

    render(<GroupMemberManagement
        group={groupWhereSelfHas(BLINDED)}
        onRoleChange={async (): Promise<void> => {}}
        onKickMember={async (): Promise<void> => {}}
      />);
    // Told why, not shown an empty list -- a blank roster reads as "no members".
    expect(screen.getByTestId('group-members-restricted')).toBeTruthy();
  });
});

describe('the sendMessages switch', () => {
  it('replaces the composer with the reason, and leaves it alone when permitted', async () => {
    const { useGroupPermissions } = await import('@/hooks/use-group-permissions');
    const { GroupChatView } = await import('../GroupChatView');

    // Driven from the role itself rather than a literal, so this covers the
    // whole chain the defect broke: role -> can('sendMessages') -> composer.
    const allowed: boolean = renderHook(() =>
      useGroupPermissions(groupWhereSelfHas(DEFAULT_MEMBER_PERMISSIONS)),
    ).result.current.can('sendMessages');
    const muted: boolean = renderHook(() =>
      useGroupPermissions(groupWhereSelfHas(MUTED)),
    ).result.current.can('sendMessages');
    expect(allowed).toBe(true);
    expect(muted).toBe(false);

    const permitted: ReturnType<typeof render> = render(
      <GroupChatView groupId="g1" currentUserName="self" canSendMessages={allowed} />,
    );
    expect(screen.queryByTestId('group-message-input')).toBeTruthy();
    expect(screen.queryByTestId('group-send-restricted')).toBeNull();
    permitted.unmount();

    render(<GroupChatView groupId="g1" currentUserName="self" canSendMessages={muted} />);
    expect(screen.queryByTestId('group-message-input')).toBeNull();
    expect(screen.getByTestId('group-send-restricted')).toBeTruthy();
  });
});
