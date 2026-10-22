/**
 * Making a document in a chat opens it, whatever the network is doing with the invitation.
 *
 * Owner report (live site): after choosing the app in the chat's New document dialog the
 * document did not open; the conversation stayed on screen. The tab opened only once
 * `sendMessage` had resolved -- the whole round trip of the invitation (CheckState, the
 * leader's ack, the agent's transmit) -- and never if it failed, although the document
 * already existed. A text message stops waiting the moment its bubble exists
 * (`onOptimisticAppend`); the invitation now does the same, and a later delivery failure
 * belongs to the bubble and a toast, not to the document.
 *
 * Rendered: the whole P2PChat, unmodified, as the polish harness mounts it. Mocked: the
 * messenger's `sendMessage` alone (network I/O; it records the bubble and then either hangs
 * or fails, as the network does), the document store's LocalDB persistence (storage I/O), the
 * leader's answer about what the agent hosts (a cross-tab request; here: nothing) and the editor
 * body (TipTap needs layout jsdom lacks; the-editor-loads-when-a-document-opens covers the lazy
 * boundary itself).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SendMessageOptions } from '@/lib/p2p/message-sender-types';
import type { P2PMessage } from '@/lib/p2p/p2p-types';

vi.mock('@/lib/live-document-store/persistence', () => ({
  saveDocumentToDB: async (): Promise<void> => undefined,
  loadDocumentFromDB: async (): Promise<null> => null,
  saveIndexToDB: async (): Promise<undefined> => undefined,
  loadIndexFromDB: async (): Promise<never[]> => [],
  deleteDocumentFromDB: async (): Promise<void> => undefined,
  decodeValue: (v: unknown): string => String(v),
}));
vi.mock('../LiveDocumentView', () => ({
  LiveDocumentView: ({ documentTitle }: { documentTitle: string }): JSX.Element => (
    <h2 data-testid="live-doc-title-heading">{documentTitle}</h2>
  ),
}));

const { P2PChat } = await import('../P2PChat');
const { P2PMessengerManager } = await import('@/lib/p2p');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { ConfirmDialogProvider } = await import('@/components/shared/confirm-dialog');
const { Toaster } = await import('@/components/ui/sonner');
const { registerCapabilityRoute } = await import('@/lib/agent-conversations/capabilities');

// The leader's answer to "what does the agent host": nothing, so this browser runs its own messaging.
registerCapabilityRoute({
  isLeader: (): boolean => false,
  askLeader: async () => ({ agentIlm: false, supervisesP2p: false, stagesUploads: false, takesConsole: false, noticesHeard: false }),
});

type Send = (peer: bigint, content: string, options?: SendMessageOptions) => Promise<P2PMessage>;

/** The bubble is recorded, then the network round trip never finishes. */
const recordedThenInFlight: Send = (_peer, _content, options) => {
  options?.onOptimisticAppend?.();
  return new Promise<P2PMessage>(() => undefined);
};
/** The bubble is recorded, then delivery fails (peer unreachable, the leader's ack timed out). */
const recordedThenFailed: Send = async (_peer, _content, options) => {
  options?.onOptimisticAppend?.();
  throw new Error('Peer 2 did not acknowledge the message');
};
/** Fails before any bubble exists: nothing was recorded, so there is no invitation to retry. */
const failedBeforeRecording: Send = async () => { throw new Error('Not connected to server'); };

function renderChat(): void {
  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <ConfirmDialogProvider><TooltipProvider>
        <P2PChat peerCid={2n} peerName="Ada Lovelace" peerUsername="ada" currentUserCid={1n} currentUserName="Me" />
        <Toaster />
      </TooltipProvider></ConfirmDialogProvider>
    </MemoryRouter>,
  );
}

async function makeDocument(title: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Live Doc' }));
  const dialog: HTMLElement = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByTestId('live-doc-app-docs'));
  await userEvent.type(within(dialog).getByTestId('live-doc-title'), title);
  await userEvent.click(within(dialog).getByTestId('live-doc-create'));
}

describe('a document made in a chat', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('opens once its invitation is in the conversation, without waiting for the network', async () => {
    vi.spyOn(P2PMessengerManager.getInstance(), 'sendMessage').mockImplementation(recordedThenInFlight);
    renderChat();
    await makeDocument('Launch plan');

    expect((await screen.findByTestId('live-doc-title-heading')).textContent).toBe('Launch plan');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByTestId('p2p-message-input')).toBeNull(); // the conversation is no longer the pane
  });

  it('stays open when the invitation then fails to deliver, and says the peer was not reached', async () => {
    vi.spyOn(P2PMessengerManager.getInstance(), 'sendMessage').mockImplementation(recordedThenFailed);
    renderChat();
    await makeDocument('Launch plan');

    expect((await screen.findByTestId('live-doc-title-heading')).textContent).toBe('Launch plan');
    expect(await screen.findByText(/did not acknowledge/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog and its error when nothing could be recorded', async () => {
    // The discrimination: the dialog's own failure path still renders, and no tab opens.
    vi.spyOn(P2PMessengerManager.getInstance(), 'sendMessage').mockImplementation(failedBeforeRecording);
    renderChat();
    await makeDocument('Launch plan');

    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not create the document/);
    expect(screen.queryByTestId('live-doc-title-heading')).toBeNull();
  });
});
