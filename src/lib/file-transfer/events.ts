/**
 * File Transfer Events
 *
 * Event constants for file transfer functionality.
 */

import type { P2PMessagingLayerPayload } from '@/types/p2p-commands';
import type { FileTransferState } from '@/types/messaging-layer';

export const FILE_TRANSFER_EVENTS = {
  REQUEST_RECEIVED: 'file-transfer:request-received',
  REQUEST_SENT: 'file-transfer:request-sent',
  /** The offer went to the recipient; payload: `OfferAnnounced`. */
  OFFER_ANNOUNCED: 'file-transfer:offer-announced',
  STATE_CHANGED: 'file-transfer:state-changed',
  PROGRESS_UPDATED: 'file-transfer:progress-updated',
  COMPLETED: 'file-transfer:completed',
  CANCELLED: 'file-transfer:cancelled',
  ERROR: 'file-transfer:error',
} as const;

export type FileTransferEventType = typeof FILE_TRANSFER_EVENTS[keyof typeof FILE_TRANSFER_EVENTS];

/** Raised once the offer for a transfer has been sent to its recipient. */
export interface OfferAnnounced {
  announcement: P2PMessagingLayerPayload;
  transferState: FileTransferState;
}
