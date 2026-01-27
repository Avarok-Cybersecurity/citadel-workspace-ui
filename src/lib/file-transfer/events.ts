/**
 * File Transfer Events
 *
 * Event constants for file transfer functionality.
 */

export const FILE_TRANSFER_EVENTS = {
  REQUEST_RECEIVED: 'file-transfer:request-received',
  REQUEST_SENT: 'file-transfer:request-sent',
  STATE_CHANGED: 'file-transfer:state-changed',
  PROGRESS_UPDATED: 'file-transfer:progress-updated',
  COMPLETED: 'file-transfer:completed',
  CANCELLED: 'file-transfer:cancelled',
  ERROR: 'file-transfer:error',
} as const;

export type FileTransferEventType = typeof FILE_TRANSFER_EVENTS[keyof typeof FILE_TRANSFER_EVENTS];
