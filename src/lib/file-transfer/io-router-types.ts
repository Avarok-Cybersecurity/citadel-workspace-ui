/**
 * File Transfer I/O Router Types
 *
 * Type definitions for the abstract IFileTransferIORouter interface.
 * Used by the RealProtocolIORouter implementation.
 */

import type { FileTransferMode, FileTransferState } from '@/types/messaging-layer';

// ============================================================================
// FileSource Enum (matches Rust definition)
// ============================================================================

/**
 * FileSource enum for specifying file source in SendFile requests.
 * Matches the Rust FileSource enum in citadel-internal-service-types.
 */
export type FileSource =
  | { Path: string }
  | { PickFileRef: { pick_file_request_id: string } }
  | { ByteContents: { file_name: string; data: number[] } };

// ============================================================================
// Send Operation Types
// ============================================================================

export interface SendFileParams {
  /** Source file - File object for message-based, path/PickFileRef for real protocol */
  source: File | string;
  /** Sender's CID */
  cid: bigint;
  /** Recipient's CID (null for C2S server storage) */
  peerCid: bigint | null;
  /** Transfer mode */
  mode: FileTransferMode;
  /** Client-generated transfer ID for correlation */
  transferId: string;
  /** Optional chunk size override */
  chunkSize?: number;
  /** File metadata (required for message-based protocol) */
  metadata?: FileMetadata;
  /** PickFile request ID (for real protocol with PickFileRef) */
  pickFileRequestId?: string;
}

export interface FileMetadata {
  fileName: string;
  fileSize: number;
  fileType: string;
  thumbnail?: string;
  expiresAt?: number;
}

export interface SendFileResult {
  /** Protocol-level identifier (object_id for real protocol, transfer_id for message-based) */
  protocolId: string;
  /** Client transfer ID echoed back */
  transferId: string;
}

export interface CancelTransferParams {
  transferId: string;
  targetCid: bigint;
  reason?: string;
}

// ============================================================================
// Receive Operation Types
// ============================================================================

export interface RespondTransferParams {
  /** For real protocol: object_id. For message-based: transfer_id */
  protocolId: string;
  cid: bigint;
  peerCid: bigint;
  accept: boolean;
  downloadLocation?: string;
}

export interface DownloadFileParams {
  virtualDirectory: string;
  cid: bigint;
  peerCid: bigint | null;
  securityLevel?: string;
  deleteOnPull?: boolean;
}

// ============================================================================
// Event Types (for subscriptions)
// ============================================================================

export interface TransferRequestEvent {
  /** Recipient's CID (our CID) */
  cid: bigint;
  /** Sender's CID */
  peerCid: bigint;
  /** Protocol-level ID (object_id or transfer_id) */
  protocolId: string;
  /** File name (only in message-based) */
  fileName?: string;
  /** File size in bytes (only in message-based) */
  fileSize?: number;
  /** MIME type (only in message-based) */
  fileType?: string;
  /** Transfer mode */
  transferMode?: FileTransferMode;
  /** Thumbnail data (only in message-based) */
  thumbnail?: string;
  /** Expiry timestamp (only in message-based) */
  expiresAt?: number;
  /** Virtual path for async mode (only in message-based) */
  virtualPath?: string;
}

export interface TransferProgressEvent {
  transferId: string;
  protocolId?: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status?: TransferProgressStatus;
}

export type TransferProgressStatus =
  | 'pending'
  | 'uploading'
  | 'downloading'
  | 'transferring'
  | 'complete'
  | 'failed';

export interface TransferCompleteEvent {
  transferId: string;
  protocolId?: string;
  success: boolean;
  downloadPath?: string;
  errorMessage?: string;
}

export interface TransferStatusEvent {
  protocolId: string;
  cid: bigint;
  success: boolean;
  accepted: boolean;
  message?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ChunkData {
  data: string; // base64 encoded
  index: number;
}

export interface BlobResult {
  blob: Blob;
  downloadUrl: string;
}

// ============================================================================
// Router Configuration
// ============================================================================

export type IORouterType = 'real-protocol';

export interface IORouterConfig {
  type: IORouterType;
}
