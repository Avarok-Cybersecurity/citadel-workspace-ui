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

const { toast, sent, answer } = vi.hoisted(() => ({
  toast: vi.fn(),
  sent: [] as unknown[],
  answer: { current: {} as Record<string, unknown> },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: (): { toast: typeof toast } => ({ toast }) }));
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
      addMember: (userId: string, role: import('@/types/workspace-protocol').UserRoleTS, domainId?: string): Promise<void> =>
        members.addMember(sender, userId, role, domainId),
    },
  };
});

import { MemberManagementModal } from '../MemberManagementModal';
import { eventEmitter } from '@/lib/event-emitter';

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
});

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
    const refusal: string = 'Failed to add member: Permission denied: AddUsers is required to manage members';
    answer.current = { Error: refusal };
    const onClose: ReturnType<typeof vi.fn> = vi.fn();
    submitAdd('bob', onClose);

    expect(await screen.findByTestId('entity-modal-error')).toHaveTextContent(refusal);
    expect(onClose).not.toHaveBeenCalled();
    expect(toastTitles()).not.toContain('Member Added');
    // A refused write changed nothing, so there is nothing to reload.
    expect(reloads).toHaveLength(0);
  });
});
