/**
 * Why a folder cannot take an upload, or null when it can.
 *
 * One answer for the two places that need it: the upload path, which refuses,
 * and the toolbar, which says so before the user has picked a file rather than
 * after. Written out at each, the button would stay live over a folder the
 * upload then turned away.
 */
import { SENT_FILES_DIR } from '@/types/revfs-types';

export function uploadRefusal(targetPath: string): string | null {
  const isStandardTransfer: boolean =
    targetPath === SENT_FILES_DIR || targetPath.startsWith(SENT_FILES_DIR + '/');
  return isStandardTransfer
    ? 'Sent Files lists what you sent in chat. Use P2P Chat to send files directly.'
    : null;
}
