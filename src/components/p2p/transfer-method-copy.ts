/**
 * What the file-send dialog says each transfer method does.
 *
 * "Send File" read "Stores on server, recipient downloads when ready", then
 * "Saves an encrypted copy into their storage right away". Neither was ever
 * true: the copy it saved was a RE-VFS object only the SENDER can retrieve, so
 * no recipient could open one. It now sends the browser's bytes over the
 * protocol transfer, which they accept (or auto-accept) like any offer, capped
 * at the inline-upload limit.
 */
import { MAX_BYTE_CONTENTS_BYTES } from '@/lib/file-transfer/server-upload';

const limitMb: number = Math.floor(MAX_BYTE_CONTENTS_BYTES / (1024 * 1024));

export const TRANSFER_METHOD_COPY: { readonly async: string; readonly p2p: string } = {
  async: `Sends it from this browser, encrypted end to end, as soon as they accept (or right away if they auto-accept your files). You both need to be online. Up to ${limitMb} MB.`,
  p2p: 'Streams straight to them once they accept. You both stay online until it finishes.',
};
