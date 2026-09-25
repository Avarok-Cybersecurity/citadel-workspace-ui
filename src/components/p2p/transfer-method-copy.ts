/**
 * What the file-send dialog says each transfer method does.
 *
 * "Send File" read "Stores on server, recipient downloads when ready". It does
 * neither: `uploadFileToServer` sends the bytes through the recipient's agent
 * into THEIR encrypted RE-VFS storage, which needs them online at send time,
 * and is capped at the inline-upload limit. Nothing waits on a server.
 */
import { MAX_BYTE_CONTENTS_BYTES } from '@/lib/file-transfer/server-upload';

const limitMb: number = Math.floor(MAX_BYTE_CONTENTS_BYTES / (1024 * 1024));

export const TRANSFER_METHOD_COPY: { readonly async: string; readonly p2p: string } = {
  async: `Saves an encrypted copy into their storage right away, then they open it from the chat. They must be online now. Up to ${limitMb} MB.`,
  p2p: 'Streams straight to them once they accept. You both stay online until it finishes.',
};
