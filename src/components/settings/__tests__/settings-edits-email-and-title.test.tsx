/**
 * Settings > General edits email and job title alongside name and avatar,
 * starting from what the server already holds, and sends only what changed.
 *
 * Mocked, and why: `WorkspaceService` is the socket (the send is what is
 * asserted), and `user-service` reads IndexedDB for the display name. The form
 * logic between them is the real component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceProvider, type WorkspaceState } from '@/contexts/WorkspaceContext';
import { GeneralSettingsTab } from '../GeneralSettingsTab';

const updateUserProfile: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => undefined);

vi.mock('@/lib/workspace-service', () => ({
  default: { updateUserProfile: (...args: unknown[]): unknown => updateUserProfile(...args) },
}));
vi.mock('@/lib/user-service', () => ({
  default: { getCurrentUser: async (): Promise<{ username: string; fullName: string }> => ({ username: 'ada', fullName: 'Ada Lovelace' }) },
}));

function renderTab(): void {
  const state: WorkspaceState = {
    currentUser: { id: 'ada', username: 'ada', name: 'Ada Lovelace', email: 'ada@example.com', title: 'Engineer' },
    members: {}, nodes: {}, nodesUnavailable: false, treeSchema: null,
    loading: { workspace: false, members: false, nodes: false },
    messages: { byPeer: {} }, typing: { peerIds: [], lastUpdated: 0 },
  } as WorkspaceState;
  render(<WorkspaceProvider state={state}><GeneralSettingsTab /></WorkspaceProvider>);
}

const save = (): HTMLButtonElement => screen.getByRole('button', { name: /Save Changes/ }) as HTMLButtonElement;

describe('Settings > General profile details', () => {
  beforeEach(() => updateUserProfile.mockClear());

  it('starts from the stored email and title, with nothing to save', async () => {
    renderTab();
    const email: HTMLInputElement = (await screen.findByLabelText('Email')) as HTMLInputElement;
    expect(email.value).toBe('ada@example.com');
    expect((screen.getByLabelText('Job title') as HTMLInputElement).value).toBe('Engineer');
    expect(save().disabled).toBe(true);
  });

  it('sends a cleared email as "" and leaves the untouched title out', async () => {
    renderTab();
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: '' } });
    fireEvent.click(save());
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(updateUserProfile).toHaveBeenCalledWith({
      name: undefined, avatarData: undefined, email: '', title: undefined,
    });
  });

  it('will not save an email the server would refuse', async () => {
    renderTab();
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'not an email' } });
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@work.example' } });
    expect(save().disabled).toBe(false);
  });
});
