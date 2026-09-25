/**
 * Add member sends AddMember, reports the SERVER's answer, and refreshes.
 *
 * The modal existed with no way to open it; now that it is reachable, what it
 * does on submit is the product. The server (`add_user_to_domain`) answers
 * `Success("Member added successfully")` or `Error("Failed to add member: …")`,
 * and only the first may close the dialog or say "Member Added".
 *
 * Driven for real from the form down to the frame: the modal, the service's
 * `addMember`, `awaitWriteResponse` and the event bus. The doubles are the
 * wire (a sender that records the request and plays the server's answer back
 * on `workspace:raw-response`, as the response handler does) and the toast sink.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';

const { toast, sent, answer, caller, roster } = vi.hoisted(() => ({
  toast: vi.fn(),
  sent: [] as unknown[],
  answer: { current: {} as Record<string, unknown> },
  // The caller's root answer, as GetUserPermissions left it in the context.
  caller: { role: 'Admin' as string | null },
  // The root roster ListMembers answers with.
  roster: { current: [] as Array<{ id: string; username: string; role: string }> },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: (): { toast: typeof toast } => ({ toast }) }));
// The permissions cache is the store boundary: it holds what GetUserPermissions
// answered, and what the dialog reads from it is the caller's root entry.
// Everything past it -- the hook, the rule, the roster load -- runs for real.
vi.mock('@/lib/permissions-service', async (importOriginal: () => Promise<Record<string, unknown>>) => ({
  ...(await importOriginal()),
  permissionsService: {
    getPermissions: (): unknown =>
      caller.role === null ? null : { domainId: 'workspace-root', role: caller.role, permissions: new Set(), lastUpdated: 0 },
  },
}));
vi.mock('@/lib/workspace-service', async () => {
  const members: typeof import('@/lib/workspace-service/member-operations') =
    await import('@/lib/workspace-service/member-operations');
  const { eventEmitter } = await import('@/lib/event-emitter');
  const sender: import('@/lib/workspace-service/workspace-operations').ProtocolSender = {
    currentCid: 1n,
    sendProtocolRequest: async (request: WorkspaceProtocolRequestTS): Promise<void> => {
      sent.push(request);
      queueMicrotask((): void => { eventEmitter.emit('workspace:raw-response', answer.current); });
    },
  };
  return {
    default: {
      listMembers: async (domainId: string): Promise<void> => {
        queueMicrotask((): void => {
          eventEmitter.emit('members:loaded', { members: roster.current, domainId });
        });
      },
      addMember: (userId: string, role: import('@/types/workspace-protocol').UserRoleTS, domainId?: string): Promise<void> =>
        members.addMember(sender, userId, role, domainId),
    },
  };
});

import { MemberManagementModal } from '../MemberManagementModal';
import { eventEmitter } from '@/lib/event-emitter';
import { NO_ADD_USERS } from '@/components/layout/sidebar/add-member-gate';

const reloads: unknown[] = [];
eventEmitter.on('members:reload', (payload: unknown): void => { reloads.push(payload); });

function submitAdd(username: string, onClose: () => void, domainId?: string): void {
  render(<MemberManagementModal isOpen onClose={onClose} mode="add" domainId={domainId} />);
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.click(screen.getByTestId('entity-modal-submit'));
}

function toastTitles(): string[] {
  return toast.mock.calls.map((call: unknown[]): string => (call[0] as { title: string }).title);
}

beforeEach((): void => {
  sent.length = 0;
  reloads.length = 0;
  toast.mockClear();
  caller.role = 'Admin';
  roster.current = [];
});

/** The roles the dialog's select carries, read from the native select Radix mirrors them into. */
function offeredRoles(): string[] {
  return Array.from(document.querySelectorAll('select option'))
    .map((option: Element): string => (option as HTMLOptionElement).value)
    .filter((value: string): boolean => value !== '')
    // Radix appends an option as each item registers, so order is not the menu's.
    .sort();
}

describe('adding a member', () => {
  it('sends AddMember for the username and domain the form names', async () => {
    answer.current = { Success: 'Member added successfully' };
    submitAdd('bob', vi.fn(), 'office-1');

    await waitFor((): void => { expect(sent).toHaveLength(1); });
    expect(sent[0]).toEqual({ AddMember: { user_id: 'bob', domain_id: 'office-1', role: 'Member', metadata: undefined } });
  });

  it('closes, says so and refreshes the roster only once the server accepts', async () => {
    answer.current = { Success: 'Member added successfully' };
    const onClose: ReturnType<typeof vi.fn> = vi.fn();
    submitAdd('bob', onClose);

    await waitFor((): void => { expect(onClose).toHaveBeenCalled(); });
    expect(toastTitles()).toEqual(['Member Added']);
    expect(reloads).toHaveLength(1);
  });

  it("shows the server's refusal in the dialog and keeps it open", async () => {
    answer.current = { Error: "Failed to add member: No account named 'bobb' exists on this workspace" };
    const onClose: ReturnType<typeof vi.fn> = vi.fn();
    submitAdd('bobb', onClose);

    const shown: HTMLElement = await screen.findByTestId('entity-modal-error');
    expect(shown).toHaveTextContent("No account named 'bobb' exists on this workspace");
    expect(shown).not.toHaveTextContent('Failed to add member');
    expect(onClose).not.toHaveBeenCalled();
    expect(toastTitles()).not.toContain('Member Added');
    // A refused write changed nothing, so there is nothing to reload.
    expect(reloads).toHaveLength(0);
  });

  it('says a permission refusal in plain words, not the permission name', async () => {
    answer.current = { Error: 'Failed to add member: Permission denied: AddUsers is required to manage members' };
    submitAdd('bob', vi.fn());

    const shown: HTMLElement = await screen.findByTestId('entity-modal-error');
    expect(shown).toHaveTextContent(NO_ADD_USERS);
    expect(shown).not.toHaveTextContent(/Permission denied|AddUsers/);
  });
});

describe('the role list', () => {
  it('does not offer an Admin the Owner seat someone already holds', async () => {
    roster.current = [{ id: 'olga', username: 'olga', role: 'Owner' }];
    render(<MemberManagementModal isOpen onClose={vi.fn()} mode="add" />);

    await waitFor((): void => { expect(offeredRoles()).toEqual(['Admin', 'Guest', 'Member']); });
  });

  it('offers an Admin a vacant Owner seat, which the server lets them fill', async () => {
    roster.current = [{ id: 'ada', username: 'ada', role: 'Admin' }];
    render(<MemberManagementModal isOpen onClose={vi.fn()} mode="add" />);

    await waitFor((): void => { expect(offeredRoles()).toEqual(['Admin', 'Guest', 'Member', 'Owner']); });
  });

  it('offers an Owner every role', async () => {
    caller.role = 'Owner';
    roster.current = [{ id: 'olga', username: 'olga', role: 'Owner' }];
    render(<MemberManagementModal isOpen onClose={vi.fn()} mode="add" />);

    await waitFor((): void => { expect(offeredRoles()).toEqual(['Admin', 'Guest', 'Member', 'Owner']); });
  });
});
