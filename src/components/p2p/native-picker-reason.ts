import type { FileTransferMode } from '@/types/messaging-layer';

/**
 * Why the agent's native file picker cannot serve the chosen method, or null when it can.
 * It hands the agent a path on disk and streams from there (sendFileWithNativePicker), so
 * it carries out P2P Only Transfer and nothing else; "Send File" needs bytes the browser
 * holds.
 */
export function nativePickerBlockedReason(mode: FileTransferMode): string | null {
  return mode === 'p2p'
    ? null
    : 'Streams straight to them, as P2P Only Transfer. To save a copy into their storage, drop the file here or browse below.';
}
