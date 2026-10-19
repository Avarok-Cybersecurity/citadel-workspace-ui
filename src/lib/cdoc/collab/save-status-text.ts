/** What the title bar says for each SaveStatus: the one place the wording lives. */
import type { SaveStatus } from './save-status';

export const SAVE_STATUS_TEXT: Readonly<Record<SaveStatus, string>> = {
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline: changes will sync when you\'re back online',
  savedToDevice: 'Saved to this device',
  unsavedOnDevice: 'Unsaved changes on this device',
};
