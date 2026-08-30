/**
 * "Encryption Level: Security level for this conversation" did nothing.
 *
 * Three controls in `ChatSettingsPanel`'s General tab were uncontrolled —
 * `defaultValue`, no `value`, no `onChange`, no store, no consumer:
 *
 *   Encryption Level      Standard / High / Maximum
 *   Connection Priority   P2P First / Server First / Auto
 *   Message Retention     a slider whose "90 days" label is static text, so
 *                         dragging it did not move the number it was setting
 *
 * The file's own comment, on the switches directly above them, says why this
 * is not acceptable here:
 *
 *   they were uncontrolled `Switch defaultChecked` here, with no handler and no
 *   store … On a product whose subject is privacy, a switch that lies about
 *   what you are broadcasting is the worst kind to fake.
 *
 * Those switches were fixed. Their three siblings in the same tab were not, and
 * one of them claims to set an encryption level.
 *
 * `PrivacySettingsTab` already had the honest pattern for a control this build
 * cannot act on: disable it and say so. That note is now shared.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/p2p/p2p-messenger-manager', () => ({ p2pMessengerManager: {} }));

const { ChatSettingsPanel } = await import('../ChatSettingsPanel');
const { ConfirmDialogProvider } = await import('@/components/shared/confirm-dialog');

/** The three live in the Advanced tab, and an inactive tab panel does not mount. */
async function openAdvanced(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: /advanced/i }));
}

function panel(): void {
  render(
    <ConfirmDialogProvider>
    <ChatSettingsPanel
      isOpen={true}
      onClose={(): void => {}}
      peerCid="42"
      peerName="alice"
    />
    </ConfirmDialogProvider>,
  );
}

/** The three controls that have no store behind them. */
const INERT: readonly string[] = ['encryption-level', 'connection-priority', 'message-retention'];

describe('a settings control with nothing behind it', () => {
  it('is disabled rather than pretending to work', async () => {
    panel();
    await openAdvanced();
    for (const id of INERT) {
      const control: HTMLElement = document.getElementById(id) as HTMLElement;
      expect(control, id).toBeTruthy();
      expect((control as HTMLInputElement).disabled, id).toBe(true);
    }
  });

  it('says why, in as many places as there are controls', async () => {
    panel();
    await openAdvanced();
    // One note per inert control: a single note somewhere on the page does not
    // tell you WHICH switch is theatre.
    expect(screen.getAllByText(/not enforced yet/i).length).toBeGreaterThanOrEqual(INERT.length);
  });

  it('leaves the controls that do work alone', async () => {
    // The positive control. Read receipts and typing indicators are bound to
    // the privacy store and enforced in the send paths; disabling everything
    // would satisfy the test above and break two settings that work.
    panel();
    const readReceipts: HTMLElement = document.getElementById('read-receipts') as HTMLElement;
    expect(readReceipts).toBeTruthy();
    expect(readReceipts.getAttribute('disabled')).toBeNull();
    await userEvent.click(readReceipts);
  });
});
