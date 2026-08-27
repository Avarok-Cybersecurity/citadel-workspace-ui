/**
 * AlertDialogAction is a Radix Close. Wiring an async onConfirm to it directly
 * shuts the dialog on the click, before the delete resolves — so a caller that
 * renders its failure reason inside the dialog's description shows it to nobody,
 * and TreeNodesSection's "Closed only on success" comment described the opposite
 * of what happened.
 *
 * These drive the real component. Asserting the source contains preventDefault
 * would pass on any version that mentions it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';

/** Mirrors TreeNodesSection: the dialog closes from caller state, on success only. */
function Harness({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={() => setOpen(false)}
      title="Delete Node"
      description={<>Are you sure?{error && <span role="alert">{error}</span>}</>}
      onConfirm={async () => {
        setError(null);
        try {
          await onConfirm();
          setOpen(false);
        } catch {
          setError('Could not delete this node.');
        }
      }}
    />
  );
}

describe('ConfirmDeleteDialog', () => {
  it('stays open so a failed delete can show its reason inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => Promise.reject(new Error('denied'))} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not delete this node.');
    // The dialog itself must still be mounted — an error rendered into an
    // unmounted description is the exact defect.
    expect(screen.getByText('Delete Node')).toBeInTheDocument();
  });

  it('closes when the delete succeeds', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => Promise.resolve()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Delete Node')).not.toBeInTheDocument());
  });

  it('ignores a second click while the first delete is still in flight', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = () => r(); }));
    render(<Harness onConfirm={onConfirm} />);

    const button = screen.getByRole('button', { name: 'Delete' });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);

    expect(onConfirm).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(screen.queryByText('Delete Node')).not.toBeInTheDocument());
  });
});
