/**
 * Bringing a persisted transfer back after a reload, honestly.
 *
 * Every transfer is written to `citadel:file-transfers` and nothing read it
 * back, so a reload lost all of them while the message bubble kept rendering
 * from the message record. Accept, Decline and Cancel then threw "Transfer not
 * found" — a sentence that is false about the world: the agent still had it,
 * and the browser had forgotten a record it explicitly persisted. The user
 * could not even dismiss the bubble.
 *
 * Restoring is not resuming. A transfer that was MOVING when the page went away
 * cannot continue — the browser's Blob is gone with the tab, and the bytes were
 * flowing through a stream that no longer has a reader. Bringing one back as
 * `transferring` would give the user a progress bar that never moves again,
 * which is the "Downloading… 40%" forever that this same store produced.
 *
 * So in-flight transfers come back as `error`, which the bubble already renders
 * with a reason and a way out; terminal ones come back as they were, so history
 * survives.
 */

import type { FileTransfer } from './types';
import type { FileTransferState } from '@/types/messaging-layer';

/** States that describe a finished transfer. Anything else was moving. */
const TERMINAL: ReadonlySet<FileTransferState> = new Set<FileTransferState>([
  'complete',
  'declined',
  'cancelled',
  'expired',
  'error',
]);

/** Fields without which a transfer cannot be rendered or acted on. */
function isUsable(raw: Partial<FileTransfer>): raw is Partial<FileTransfer> & {
  id: string;
  fileName: string;
  state: FileTransferState;
} {
  return (
    typeof raw.id === 'string' &&
    raw.id !== '' &&
    typeof raw.fileName === 'string' &&
    typeof raw.state === 'string'
  );
}

export function restoreTransfer(raw: Partial<FileTransfer>): FileTransfer | null {
  if (!isUsable(raw)) return null;

  const interrupted: boolean = !TERMINAL.has(raw.state);

  return {
    id: raw.id,
    fileName: raw.fileName,
    fileSize: raw.fileSize ?? 0,
    fileType: raw.fileType ?? '',
    mode: raw.mode ?? 'p2p',
    state: interrupted ? 'error' : raw.state,
    // A restored transfer has no live progress. Keeping the last number would
    // leave a bar that looks like it is about to finish and never will.
    progress: interrupted ? 0 : (raw.progress ?? 100),
    senderCid: raw.senderCid ?? '',
    recipientCid: raw.recipientCid ?? '',
    isIncoming: raw.isIncoming ?? false,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
    // Where the internal service wrote the file on its own filesystem. Dropped
    // here before, so after a reload the "Click to open file" control rendered
    // and operated on nothing -- a button that reads as working and does not.
    // FilesSection surfaces it as `savedTo`. Only meaningful for a transfer
    // that actually finished, which is what `interrupted` decides.
    ...(interrupted ? {} : { downloadPath: raw.downloadPath, virtualPath: raw.virtualPath }),
    ...(interrupted
      ? { errorMessage: 'Interrupted when the page reloaded. Ask them to send it again.' }
      : {}),
  } as FileTransfer;
}
