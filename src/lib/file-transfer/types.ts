/**
 * File Transfer Types
 *
 * Type definitions for file transfer functionality.
 */

import type { FileTransferState, FileTransferMode } from '@/types/messaging-layer';

// ============================================================================
// Core Types
// ============================================================================

export interface FileTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  thumbnail?: string;
  mode: FileTransferMode;
  state: FileTransferState;
  progress: number; // 0-100
  senderCid: string;
  recipientCid: string;
  virtualPath?: string;
  downloadPath?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  isIncoming: boolean; // true if we are the recipient
}

export type TransferModePreference = 'browser' | 'protocol';

export interface FileTransferSettings {
  autoAccept: boolean;
  maxFileSize: number;
  // Transfer mode preference
  transferMode: TransferModePreference; // 'browser' = in-browser (default), 'protocol' = Citadel Protocol
  // RE-VFS settings
  allowRevfsStorage: boolean;
  revfsQuota: number;
}

export interface TransferProgressEvent {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

// ============================================================================
// Intent Types (for SBIO - business logic returns intents, IO executes them)
// ============================================================================

export interface SendTransferRequestIntent {
  type: 'send-transfer-request';
  transfer: FileTransfer;
}

export interface SendChunkIntent {
  type: 'send-chunk';
  transferId: string;
  recipientCid: string;
  chunkIndex: number;
  totalChunks: number;
  data: string; // base64
}

export interface SendResponseIntent {
  type: 'send-response';
  transferId: string;
  targetCid: string;
  accepted: boolean;
  reason?: string;
}

export interface SendCancelIntent {
  type: 'send-cancel';
  transferId: string;
  targetCid: string;
  reason: string;
}

export interface SendCompleteIntent {
  type: 'send-complete';
  transferId: string;
  targetCid: string;
  success: boolean;
  errorMessage?: string;
}

export interface UploadToServerIntent {
  type: 'upload-to-server';
  file: File;
  transferId: string;
  recipientCid: string;
}

export interface DownloadFromServerIntent {
  type: 'download-from-server';
  transfer: FileTransfer;
}

export interface PickFileIntent {
  type: 'pick-file';
  cid: bigint;
  title?: string;
  allowedExtensions?: string[];
}

export interface SendFileViaProtocolIntent {
  type: 'send-file-via-protocol';
  cid: string;
  peerCid: string | null;
  filePath: string;
  transferId: string;
}

export type FileTransferIntent =
  | SendTransferRequestIntent
  | SendChunkIntent
  | SendResponseIntent
  | SendCancelIntent
  | SendCompleteIntent
  | UploadToServerIntent
  | DownloadFromServerIntent
  | PickFileIntent
  | SendFileViaProtocolIntent;

// ============================================================================
// Incoming Message Types
// ============================================================================

export interface IncomingFileTransferMessage {
  layer: unknown;
  senderCid: string;
  recipientCid: string;
}

export interface FilePickerResult {
  file_path: string;
  file_name: string;
  file_size: bigint;
}
