/**
 * The default send mode could not be accepted at all.
 *
 * `acceptTransfer` issued a protocol `send-response` unconditionally, and that
 * intent needs the protocol `object_id`. The correlator only learns an
 * object_id from a `FileTransferRequestNotification` whose
 * `metadata.transfer_type === 'FileTransfer'` — and async mode stages through
 * RE-VFS, which the internal service auto-accepts and never announces that way.
 * So `resolveObjectId` returned undefined and the intent threw "has not been
 * announced over the protocol yet".
 *
 * It threw ABOVE the staged-download branch, which is why
 * `completeStagedDownload` was unreachable. Async is the mode the UI labels
 * "Recommended": the default way to send a file could not be accepted or
 * declined, the decline signal was never sent, and the recipient's bubble
 * waited for ever.
 *
 * No existing test caught it — they all stub `executeIntent`, so the throw that
 * only the real router raises never happened in a test.
 */
import { describe, it, expect, vi } from 'vitest';
import { acceptTransfer, declineTransfer, type LifecycleDeps } from '../transfer-lifecycle';
import type { FileTransfer } from '../types';

vi.mock('../server-download', () => ({
  completeStagedDownload: vi.fn().mockResolvedValue(undefined),
}));
import { completeStagedDownload } from '../server-download';

const PEER: string = '42';

function staged(overrides: Partial<FileTransfer> = {}): FileTransfer {
  return {
    id: 't1',
    senderCid: PEER,
    fileSize: 1024,
    fileName: 'notes.pdf',
    state: 'pending',
    isIncoming: true,
    updatedAt: 0,
    mode: 'async',
    virtualPath: '/staged/notes.pdf',
    ...overrides,
  } as unknown as FileTransfer;
}

function deps(transfer: FileTransfer): { d: LifecycleDeps; executeIntent: ReturnType<typeof vi.fn>; } {
  // Stands in for the real router, which throws for a transfer whose protocol
  // object_id was never learned. That is the throw the product hit.
  const executeIntent: ReturnType<typeof vi.fn> = vi.fn(() =>
    Promise.reject(new Error('This transfer has not been announced over the protocol yet.'))
  );
  return {
    d: {
      state: {
        getTransfer: () => transfer,
        getSettings: () => ({ maxFileSize: 100 * 1024 * 1024 }),
      },
      io: { executeIntent },
      emitStateChange: vi.fn(),
      saveTransfer: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn(),
      handleAsyncSend: vi.fn(),
    } as unknown as LifecycleDeps,
    executeIntent,
  };
}

describe('a staged ("Recommended") transfer', () => {
  it('is accepted without a protocol response, and downloads', async () => {
    const t: FileTransfer = staged();
    const { d, executeIntent } = deps(t);

    await acceptTransfer(d, 't1');

    expect(executeIntent).not.toHaveBeenCalled();
    expect(completeStagedDownload).toHaveBeenCalled();
    expect(t.state).toBe('transferring');
  });

  it('is declined without a protocol response', async () => {
    const t: FileTransfer = staged();
    const { d, executeIntent } = deps(t);

    await declineTransfer(d, 't1', 'no thanks');

    expect(executeIntent).not.toHaveBeenCalled();
    expect(t.state).toBe('declined');
  });

  /**
   * The opposite direction. Without this, "never send a response" would pass
   * both tests above while silently breaking every direct p2p transfer, whose
   * sender is genuinely waiting for that acceptance.
   */
  it('does not stop a direct p2p transfer from responding', async () => {
    // 'p2p' is the direct mode; the union is 'async' | 'p2p'. An earlier draft
    // of this test wrote 'sync', which tsc rejected -- worth keeping in mind
    // that the sibling suites use `as unknown as FileTransfer` casts that would
    // have swallowed it.
    const t: FileTransfer = staged({ mode: 'p2p', virtualPath: undefined });
    const executeIntent: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const d: LifecycleDeps = {
      state: {
        getTransfer: () => t,
        getSettings: () => ({ maxFileSize: 100 * 1024 * 1024 }),
      },
      io: { executeIntent },
      emitStateChange: vi.fn(),
      saveTransfer: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn(),
      handleAsyncSend: vi.fn(),
    } as unknown as LifecycleDeps;

    await acceptTransfer(d, 't1');

    expect(executeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'send-response', accepted: true })
    );
  });

  /** Neither half silently: a staged offer with no path says so. */
  it('refuses a staged transfer that carries no server path', async () => {
    const t: FileTransfer = staged({ virtualPath: undefined });
    const { d } = deps(t);

    await expect(acceptTransfer(d, 't1')).rejects.toThrow(/no server path/);
  });
});
