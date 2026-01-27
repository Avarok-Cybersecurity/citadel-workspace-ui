/**
 * File Transfer Module
 *
 * Re-exports for backward compatibility.
 */

// Types
export type {
  FileTransfer,
  FileTransferSettings,
  TransferProgressEvent,
  TransferModePreference,
  FileTransferIntent,
  IncomingFileTransferMessage,
  FilePickerResult,
} from './types';

// Events
export { FILE_TRANSFER_EVENTS, type FileTransferEventType } from './events';

// State (for testing/advanced usage)
export { FileTransferState } from './state';

// IO (for testing/advanced usage)
export { FileTransferIO } from './io';

// Service
export { FileTransferService, fileTransferService } from './service';
