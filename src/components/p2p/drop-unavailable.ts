import { PAUSE_COPY } from '@/lib/p2p-pause/pause-copy';

/**
 * Why a file dropped on the conversation cannot be taken right now, or null when it can.
 * The words go on the drop overlay, so a drop that cannot land says so instead of doing nothing.
 */
export function dropUnavailableReason(state: { viewingDocument: boolean; paused: boolean }): string | null {
  if (state.viewingDocument) return 'Drop files on the Messages tab to send them.';
  if (state.paused) return PAUSE_COPY.fileReason;
  return null;
}
