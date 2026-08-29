/**
 * Running the offer-expiry check.
 *
 * `expiresAt` was stamped and shipped, the `'expired'` state existed in the
 * union, and the bubble had a "Request expired" branch — and nothing ever wrote
 * that state, so a sender who went offline mid-offer left the recipient a
 * live-looking Accept button for ever. Pressing it started a transfer nobody
 * was on the other end of, which then sat at "Downloading…" until the tab was
 * closed.
 *
 * Swept on an interval AND once at startup, because the common case is a tab
 * closed while an offer was open: waiting a full interval to notice would show
 * the stale Accept button for exactly as long as it takes somebody to press it.
 *
 * The decision itself is in `expiredTransferIds`, without a clock or a service,
 * so it can be tested.
 */

import { expiredTransferIds } from './expire-transfers';
import { FILE_TRANSFER_EXPIRY_CHECK_INTERVAL_MS } from '@/types/messaging-layer';
import type { FileTransfer } from './types';

interface TransferStore {
  getAllTransfers(): FileTransfer[];
  getTransfer(id: string): FileTransfer | undefined;
  setTransfer(transfer: FileTransfer): void;
}

export function startExpirySweep(
  state: TransferStore,
  emitStateChange: (transfer: FileTransfer) => void,
): void {
  const sweep = (): void => {
    const now: number = Date.now();
    for (const id of expiredTransferIds(state.getAllTransfers(), now)) {
      const transfer: FileTransfer | undefined = state.getTransfer(id);
      if (!transfer) continue;

      const expired: FileTransfer = { ...transfer, state: 'expired', updatedAt: now };
      state.setTransfer(expired);
      emitStateChange(expired);
    }
  };

  sweep();
  window.setInterval(sweep, FILE_TRANSFER_EXPIRY_CHECK_INTERVAL_MS);
}
