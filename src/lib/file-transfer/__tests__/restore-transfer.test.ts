/**
 * A reload must not turn a transfer into a lie.
 *
 * Every transfer was persisted to a key nothing read back, so a reload lost all
 * of them while the message bubble kept rendering from the message record.
 * Accept, Decline and Cancel then threw "Transfer not found" — false about the
 * world: the agent still had it, and the browser had forgotten a record it
 * explicitly persisted. The user could not even dismiss the bubble.
 *
 * Restoring is not resuming, and the distinction is the whole test.
 */

import { describe, it, expect } from 'vitest';
import { restoreTransfer } from '../restore-transfer';
import type { FileTransfer } from '../types';

const persisted = (over: Record<string, unknown> = {}): Partial<FileTransfer> => ({
  id: 't-1',
  fileName: 'notes.md',
  fileSize: 1024,
  fileType: 'text/markdown',
  state: 'complete',
  isIncoming: true,
  mode: 'p2p',
  createdAt: 1,
  updatedAt: 2,
  ...over,
}) as Partial<FileTransfer>;

describe('restoring a transfer after a reload', () => {
  it('keeps a finished transfer as it was, so history survives', () => {
    for (const state of ['complete', 'declined', 'cancelled', 'expired', 'error']) {
      const restored = restoreTransfer(persisted({ state }));
      expect(restored?.state, state).toBe(state);
    }
  });

  it('does not bring an in-flight transfer back as in-flight', () => {
    // The bytes were flowing through a stream that no longer has a reader and
    // the Blob went with the tab. Restoring `transferring` gives a progress bar
    // that never moves again — the "Downloading… 40%" forever this same store
    // produced elsewhere.
    for (const state of ['pending', 'uploading', 'staged', 'transferring']) {
      const restored = restoreTransfer(persisted({ state, progress: 40 }));
      expect(restored?.state, state).toBe('error');
      expect(restored?.progress, state).toBe(0);
    }
  });

  it('says why an interrupted transfer failed', () => {
    const restored = restoreTransfer(persisted({ state: 'transferring' }));
    expect(restored?.errorMessage).toMatch(/reload/i);
    expect(restored?.errorMessage, 'and what to do about it').toMatch(/again/i);
  });

  it('drops a record too damaged to render or act on', () => {
    // A half-written localStorage entry must not become a bubble with no name
    // and no id that nothing can dismiss.
    expect(restoreTransfer({})).toBeNull();
    expect(restoreTransfer({ id: '' })).toBeNull();
    expect(restoreTransfer({ id: 't', fileName: 'x' })).toBeNull();
  });

  it('fills in what a partial record is missing rather than dropping it', () => {
    const restored = restoreTransfer({ id: 't', fileName: 'x', state: 'complete' });
    expect(restored).not.toBeNull();
    expect(restored?.fileSize).toBe(0);
    expect(restored?.mode).toBe('p2p');
  });
});
