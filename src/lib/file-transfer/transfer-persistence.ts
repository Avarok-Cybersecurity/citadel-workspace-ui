/**
 * What survives a reload, and what a reload honestly ends.
 *
 * Every transfer was written to `citadel:file-transfers` and nothing read it
 * back. So a reload lost all of them while the message bubble kept rendering
 * from the message record, and Accept, Decline and Cancel each threw "Transfer
 * not found" — a sentence that is FALSE about the world: the agent still had
 * it, and the browser had forgotten a record it explicitly persisted. The user
 * could not even dismiss the bubble.
 *
 * Restoring is not resuming; `restore-transfer.ts` carries that distinction.
 *
 * localStorage rather than IndexedDB because the payloads are small metadata
 * and the read happens on the boot path, where an async store would mean the
 * bubbles render before their transfers exist.
 */

import { debugLog } from '@/lib/debug-config';
import { restoreTransfer } from './restore-transfer';
import { pruneTransfers } from './prune-transfers';
import type { FileTransfer, FileTransferSettings } from './types';

const TRANSFERS_KEY = 'citadel:file-transfers';
const SETTINGS_KEY = 'citadel:file-transfer-settings';

interface TransferStore {
  setTransfer(transfer: FileTransfer): void;
  setSettings(peerCid: string, settings: FileTransferSettings): void;
}

export async function loadPersistedTransfers(state: TransferStore): Promise<void> {
  try {
    const settingsRaw = localStorage.getItem(SETTINGS_KEY);
    if (settingsRaw) {
      const parsed: Record<string, FileTransferSettings> = JSON.parse(settingsRaw) as Record<string, FileTransferSettings>;
      for (const [peerCid, settings] of Object.entries(parsed)) {
        state.setSettings(peerCid, settings);
      }
    }

    const transfersRaw = localStorage.getItem(TRANSFERS_KEY);
    if (transfersRaw) {
      const parsed = JSON.parse(transfersRaw) as Record<string, Partial<FileTransfer>>;
      for (const raw of Object.values(parsed)) {
        const transfer = restoreTransfer(raw);
        if (transfer) state.setTransfer(transfer);
      }
    }

    debugLog('FileTransferService', 'Loaded settings and transfers from storage');
  } catch (error) {
    // A corrupt store must not stop the app booting; the transfers it held are
    // metadata, and the conversation itself is the source of truth for what was
    // sent.
    debugLog('FileTransferService', 'Failed to load from storage:', error);
  }
}

export function persistTransfer(transfer: FileTransfer): void {
  try {
    const raw = localStorage.getItem(TRANSFERS_KEY);
    const transfers: Record<string, Partial<FileTransfer>> = raw ? JSON.parse(raw) : {};

    // Serializable metadata only — no Blob or File.
    transfers[transfer.id] = {
      id: transfer.id,
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      fileType: transfer.fileType,
      senderCid: transfer.senderCid,
      recipientCid: transfer.recipientCid,
      state: transfer.state,
      isIncoming: transfer.isIncoming,
      mode: transfer.mode,
      expiresAt: transfer.expiresAt,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    };

    // Pruned on write, because this is the only moment the whole map is in
    // hand. Without it the map grew for the life of the profile and every
    // progress tick re-serialised all of it.
    localStorage.setItem(TRANSFERS_KEY, JSON.stringify(pruneTransfers(transfers, Date.now())));
  } catch {
    // localStorage may be full. Losing the record costs history, not a
    // transfer — as long as the map is bounded, which is what the prune above
    // is for. Unbounded, the write that eventually fails is the one recording
    // a transfer still in flight.
  }
}

export function persistSettings(peerCid: string, settings: FileTransferSettings): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const all: Record<string, FileTransferSettings> = raw ? JSON.parse(raw) : {};
    all[peerCid] = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
  } catch {
    // As above.
  }
}
