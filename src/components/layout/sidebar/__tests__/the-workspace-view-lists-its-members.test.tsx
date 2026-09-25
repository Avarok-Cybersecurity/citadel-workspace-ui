/**
 * The sidebar's MEMBERS list was blank on /workspace with no node selected.
 *
 * That is the view everyone lands on after signing in. `activeDomainId` was the
 * `nodeId` query parameter and nothing else, so with no parameter it was null:
 * the hook asked for nothing, and MemberListBody rendered nothing at all -- no
 * spinner, no empty state, no members. The workspace root is a domain with
 * members (`WORKSPACE_ROOT_ID`, which the server also resolves an absent
 * `domain_id` to), and it is what that view is showing.
 *
 * Rendered for real. The doubles are I/O boundaries only: the send to the
 * server (`listMembers`) and the event bus the answer arrives on, the peer and
 * conversation hooks (IndexedDB and the agent), the pending-request store
 * and the tab's stored selection (IndexedDB), and the workspace context the
 * provider would fill from the wire.
 *
 * It supersedes no-domain-is-not-an-empty-room.test.tsx, which read the source
 * and pinned the null guard that produced this blank list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MembersPayload } from '@/lib/workspace-events';
import type { User as WorkspaceMember } from '@/types/workspace-entities';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import type { UsePermissionResult } from '@/hooks/use-permission-result';

const { listMembers } = vi.hoisted(() => ({ listMembers: vi.fn(async (): Promise<void> => {}) }));
let deliver: ((payload: MembersPayload) => void) | null = null;

// The members header asks AddUsers through `usePermission`, whose fetch is agent
// I/O and not what this file is about; answered "yes" so the header renders.
vi.mock('@/hooks/use-permission', () => ({
  usePermission: (): UsePermissionResult => ({
    allowed: true, loading: false, reason: null, unanswered: false, answered: true,
    refresh: async (): Promise<void> => {},
  }),
}));

vi.mock('@/lib/workspace-service', () => ({ default: { listMembers } }));
vi.mock('@/lib/workspace-events', () => ({
  workspaceEvents: {
    onMemberEvent: (_event: string, cb: (payload: MembersPayload) => void): (() => void) => {
      deliver = cb;
      return (): void => { deliver = null; };
    },
  },
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: (): { state: Record<string, unknown> } => ({
    state: { nodes: {}, currentUser: { username: 'alice' }, workspace: { name: 'Bench' } },
  }),
}));
vi.mock('@/hooks', async (importOriginal: () => Promise<Record<string, unknown>>) => ({
  ...(await importOriginal()),
  useGroupConversations: (): { groups: never[]; createGroup: () => Promise<string> } =>
    ({ groups: [], createGroup: async (): Promise<string> => '' }),
  useRegisteredPeers: (): { registeredPeers: never[] } => ({ registeredPeers: [] }),
  useConversationPeers: (): { peersWithConversations: never[] } => ({ peersWithConversations: [] }),
  useEventListener: (): void => {},
}));
vi.mock('@/lib/tab-context', () => ({ getSelectedUser: async (): Promise<null> => null }));
vi.mock('@/lib/peer-registration-store', () => ({
  peerRegistrationStore: {
    getPendingCount: async (): Promise<number> => 0,
    getPendingRequests: async (): Promise<never[]> => [],
  },
}));

import { MembersSection } from '../MembersSection';

function member(username: string): WorkspaceMember {
  return { id: username, username, displayName: username, isOnline: null } as unknown as WorkspaceMember;
}

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <TooltipProvider>
        <ConfirmDialogProvider>
          <SidebarProvider>
            <MembersSection />
          </SidebarProvider>
        </ConfirmDialogProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach((): void => { listMembers.mockClear(); deliver = null; });

describe('the sidebar member list with no node selected', () => {
  it('asks for the workspace root and shows its members', async () => {
    renderAt('/workspace');

    await waitFor((): void => { expect(listMembers).toHaveBeenCalledWith(WORKSPACE_ROOT_ID); });
    expect(screen.getByTestId('members-loading')).toBeInTheDocument();

    act((): void => {
      deliver?.({ members: [member('alice'), member('bob')], domainId: WORKSPACE_ROOT_ID } as MembersPayload);
    });

    expect(await screen.findByText('bob')).toBeInTheDocument();
    expect(screen.queryByTestId('members-loading')).toBeNull();
  });

  it('still asks for the node the URL names when there is one', async () => {
    // The control: the root is the fallback, not a replacement for the node.
    renderAt('/workspace?nodeId=office-7');
    await waitFor((): void => { expect(listMembers).toHaveBeenCalledWith('office-7'); });
    expect(listMembers).not.toHaveBeenCalledWith(WORKSPACE_ROOT_ID);
  });
});

describe('the all-members dialog', () => {
  it('shows the job title and email a member set, not only the hover card', async () => {
    // Seen live: bob saved "QA Lead" / bob@example.com and the dialog showed neither.
    renderAt('/workspace');
    await waitFor((): void => { expect(listMembers).toHaveBeenCalled(); });
    const bob: WorkspaceMember = { ...member('bob'), title: 'QA Lead', email: 'bob@example.com' } as unknown as WorkspaceMember;
    act((): void => {
      deliver?.({ members: [member('a1'), member('a2'), member('a3'), member('a4'), member('a5'), bob], domainId: WORKSPACE_ROOT_ID } as MembersPayload);
    });
    const viewAll: HTMLElement = await screen.findByText(/View all 6 members/);
    act((): void => { viewAll.click(); });
    const dialog: HTMLElement = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('QA Lead');
    expect(dialog).toHaveTextContent('bob@example.com');
  });
});

