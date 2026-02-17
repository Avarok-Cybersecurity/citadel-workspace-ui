/**
 * Protocol Types
 *
 * Internal service notification/response types used by the
 * real protocol I/O router for file transfer operations.
 */

// ============================================================================
// Notification types from internal service
// ============================================================================

export interface FileTransferRequestNotification {
  cid: bigint;
  peer_cid: bigint;
  metadata: {
    object_id: bigint;
    name: string;
    file_size: bigint;
    mime_type?: string;
  };
  request_id?: string;
}

export interface FileTransferStatusNotification {
  cid: bigint;
  object_id: bigint;
  success: boolean;
  /** true if this is a response to our request */
  response: boolean;
  message?: string;
  request_id?: string;
}

export interface FileTransferTickNotification {
  cid: bigint;
  peer_cid?: bigint;
  status: ObjectTransferStatus;
  request_id?: string;
}

// ============================================================================
// ObjectTransferStatus from Citadel SDK
// ============================================================================

export type ObjectTransferStatus =
  | { ReceptionBeginning: { object_id: bigint; total_length: bigint; metadata?: unknown } }
  | { ReceptionTick: { object_id: bigint; received: bigint; total: bigint } }
  | { ReceptionComplete: { object_id: bigint } }
  | { TransferTick: { object_id: bigint; sent: bigint; total: bigint } }
  | { TransferComplete: { object_id: bigint } }
  | { Fail: { object_id: bigint; message: string } };
