/** What the title bar says for each SaveStatus: the one place the wording lives. */
import type { SaveStatus } from './save-status';
import { LOCKED_ON_DEVICE } from '@/lib/at-rest/at-rest-copy';

export const SAVE_STATUS_TEXT: Readonly<Record<SaveStatus, string>> = {
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline: changes will sync when you\'re back online',
  savedToDevice: 'Saved to this device',
  unsavedOnDevice: 'Unsaved changes on this device',
  locked: LOCKED_ON_DEVICE,
};

/** A request the server will take later keeps being refused: nothing is wrong, and it is retried. */
export const SENDING_PAUSED_TEXT: string = 'Sending paused, retrying…';
