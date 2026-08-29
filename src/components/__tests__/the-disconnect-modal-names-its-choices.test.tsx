/**
 * The two destructive choices must be addressable by identity.
 *
 * This modal used to offer "Disconnect" and "Deregister", and its own comment
 * records why it stopped: it "read 'Deregister permanently removes this account
 * from the server' ... as if the difference were obvious". It now says "Sign
 * out" and "Delete account permanently", which is plainly better copy.
 *
 * `previous-sessions` pressed those buttons by their old words. From the day of
 * the rewording it found neither, and three of its checks have reported the
 * PRODUCT as broken ever since: Disconnect Removes, Deregister Removes,
 * Deregister Permanent.
 *
 * Worth noting what this case is not: the spec-copy gate cannot catch it.
 * "Disconnect" and "Deregister" both still appear elsewhere in the app, so
 * those strings exist — just not as the label of the thing being pressed.
 * Existing somewhere is not the same as being the name of the control.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DisconnectConfirmModal } from '../DisconnectConfirmModal';

vi.mock('@/components/shared/confirm-dialog', () => ({
  useConfirm: (): (() => Promise<boolean>) => async (): Promise<boolean> => true,
}));

const SESSION: Parameters<typeof DisconnectConfirmModal>[0]['session'] = {
  cid: 42n,
  username: 'ada',
} as unknown as Parameters<typeof DisconnectConfirmModal>[0]['session'];

function renderModal(onConfirm: (action: 'disconnect' | 'deregister') => void): void {
  render(
    <DisconnectConfirmModal
      open
      onOpenChange={vi.fn()}
      session={SESSION}
      workspaceName="Design"
      onConfirm={onConfirm}
    />,
  );
}

describe('the disconnect confirmation', () => {
  it('offers signing out under a stable handle', async (): Promise<void> => {
    const onConfirm: ReturnType<typeof vi.fn> = vi.fn();
    renderModal(onConfirm);

    await userEvent.click(screen.getByTestId('confirm-sign-out'));
    expect(onConfirm).toHaveBeenCalledWith('disconnect');
  });

  it('offers deleting the account under a different one', async (): Promise<void> => {
    // Two destructive choices one beside the other: the control that signs you
    // out and the control that destroys the account must never be reachable by
    // the same locator.
    const onConfirm: ReturnType<typeof vi.fn> = vi.fn();
    renderModal(onConfirm);

    await userEvent.click(screen.getByTestId('confirm-delete-account'));
    expect(onConfirm).toHaveBeenCalledWith('deregister');
  });
});
