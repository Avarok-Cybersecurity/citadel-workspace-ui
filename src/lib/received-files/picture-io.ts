/** The browser's PictureCache: the agent socket for received files, this tab's sends, object URLs. */
import { browserReceivedFileIO } from './received-file-io';
import { PictureCache } from './picture-load';
import { sentPicture } from './sent-pictures';

export const pictureCache: PictureCache = new PictureCache({
  received: browserReceivedFileIO,
  sent: sentPicture,
  objectUrl: (blob: Blob): string => URL.createObjectURL(blob),
  release: (url: string): void => URL.revokeObjectURL(url),
});
