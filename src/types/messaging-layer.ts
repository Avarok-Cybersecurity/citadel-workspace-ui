/**
 * MessagingLayer Protocol Types
 *
 * This module defines the highest-level protocol layer for P2P messaging.
 * MessagingLayer is serialized and sent as the contents of WorkspaceProtocol::Message,
 * which itself is inscribed within InternalServiceRequest::Message for P2P transport.
 *
 * Protocol nesting:
 * InternalServiceRequest::Message {
 *   peer_cid: target,
 *   message: WorkspaceProtocol::Message {
 *     contents: MessagingLayer (serialized)
 *   }
 * }
 */

/**
 * Discriminant enum for MessagingLayer variants
 */
export enum MessagingLayerType {
  Message = 'Message',
  Typing = 'Typing',
  Away = 'Away',
  Online = 'Online',
  Offline = 'Offline',
  CustomState = 'CustomState',
  CheckState = 'CheckState',
  CheckStateResponse = 'CheckStateResponse',
  // File Transfer types
  FileTransferRequest = 'FileTransferRequest',
  FileTransferResponse = 'FileTransferResponse',
  FileTransferProgress = 'FileTransferProgress',
  FileTransferComplete = 'FileTransferComplete',
  FileTransferCancel = 'FileTransferCancel',
  // P2P file chunk streaming (for browser-compatible transfers)
  FileTransferChunk = 'FileTransferChunk',
  // RE-VFS tree operations (mkdir, rmdir, placeFile, etc.)
  RevfsOperation = 'RevfsOperation'
}

/**
 * Presence status types (subset of MessagingLayerType)
 */
export type PresenceStatus =
  | MessagingLayerType.Away
  | MessagingLayerType.Online
  | MessagingLayerType.Offline
  | MessagingLayerType.CustomState;

/**
 * MessagingLayer discriminated union type
 *
 * Represents all possible message types in the P2P messaging protocol:
 * - Message: Text message with contents and timestamp
 * - Typing: Indicates peer is currently typing
 * - Away: Peer is away/idle
 * - Online: Peer is online and active
 * - Offline: Peer is offline
 * - CustomState: Custom status with text and indicator color
 */
/**
 * File transfer state enumeration
 */
export type FileTransferState =
  | 'pending'      // Waiting for recipient to accept/decline
  | 'uploading'    // Uploading to server (async mode)
  | 'staged'       // File ready on server, awaiting acceptance
  | 'transferring' // Active transfer in progress
  | 'complete'     // Transfer completed successfully
  | 'declined'     // Recipient declined the transfer
  | 'cancelled'    // Sender cancelled the transfer
  | 'expired'      // Transfer request expired (TTL exceeded)
  | 'error';       // Transfer failed with error

/**
 * File transfer mode
 */
export type FileTransferMode = 'async' | 'p2p';

/**
 * File transfer request payload
 */
export interface FileTransferRequestData {
  transfer_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  thumbnail?: string;        // Base64 for images
  transfer_mode: FileTransferMode;
  virtual_path?: string;     // For async mode - server storage path
  expiry_timestamp?: number; // When the request expires
  timestamp: number;
}

/**
 * File transfer response payload
 */
export interface FileTransferResponseData {
  transfer_id: string;
  accepted: boolean;
  decline_reason?: string;
  timestamp: number;
}

/**
 * File transfer progress payload
 */
export interface FileTransferProgressData {
  transfer_id: string;
  bytes_transferred: number;
  total_bytes: number;
  percentage: number;
  timestamp: number;
}

/**
 * File transfer complete payload
 */
export interface FileTransferCompleteData {
  transfer_id: string;
  success: boolean;
  error_message?: string;
  download_path?: string;    // Local path or URL where file was saved
  timestamp: number;
}

/**
 * File transfer cancel payload
 */
export interface FileTransferCancelData {
  transfer_id: string;
  reason?: string;
  timestamp: number;
}

/**
 * File transfer chunk payload for P2P streaming
 * Used for browser-compatible file transfers where files are sent in base64-encoded chunks
 */
export interface FileTransferChunkData {
  transfer_id: string;
  chunk_index: number;      // 0-based index of this chunk
  total_chunks: number;     // Total number of chunks for the file
  data: string;             // Base64-encoded chunk data
  checksum?: string;        // Optional SHA-256 hash of chunk data for integrity
  timestamp: number;
}

export type MessagingLayer =
  | { type: MessagingLayerType.Message; contents: string; timestamp: number }
  | { type: MessagingLayerType.Typing }
  | { type: MessagingLayerType.Away }
  | { type: MessagingLayerType.Online }
  | { type: MessagingLayerType.Offline }
  | { type: MessagingLayerType.CustomState; text: string; indicator_icon_color: string }
  | { type: MessagingLayerType.CheckState }
  | { type: MessagingLayerType.CheckStateResponse; ready: true }
  // File Transfer variants
  | { type: MessagingLayerType.FileTransferRequest } & FileTransferRequestData
  | { type: MessagingLayerType.FileTransferResponse } & FileTransferResponseData
  | { type: MessagingLayerType.FileTransferProgress } & FileTransferProgressData
  | { type: MessagingLayerType.FileTransferComplete } & FileTransferCompleteData
  | { type: MessagingLayerType.FileTransferCancel } & FileTransferCancelData
  // P2P chunk streaming variant (browser-compatible)
  | { type: MessagingLayerType.FileTransferChunk } & FileTransferChunkData
  // RE-VFS tree operations
  | { type: MessagingLayerType.RevfsOperation; operation: import('./revfs-types').RevfsOperation };

/**
 * Type guard: Check if MessagingLayer is a Message variant
 */
export function isMessage(layer: MessagingLayer): layer is { type: MessagingLayerType.Message; contents: string; timestamp: number } {
  return layer.type === MessagingLayerType.Message;
}

/**
 * Type guard: Check if MessagingLayer is a Typing variant
 */
export function isTyping(layer: MessagingLayer): layer is { type: MessagingLayerType.Typing } {
  return layer.type === MessagingLayerType.Typing;
}

/**
 * Type guard: Check if MessagingLayer is an Away variant
 */
export function isAway(layer: MessagingLayer): layer is { type: MessagingLayerType.Away } {
  return layer.type === MessagingLayerType.Away;
}

/**
 * Type guard: Check if MessagingLayer is an Online variant
 */
export function isOnline(layer: MessagingLayer): layer is { type: MessagingLayerType.Online } {
  return layer.type === MessagingLayerType.Online;
}

/**
 * Type guard: Check if MessagingLayer is an Offline variant
 */
export function isOffline(layer: MessagingLayer): layer is { type: MessagingLayerType.Offline } {
  return layer.type === MessagingLayerType.Offline;
}

/**
 * Type guard: Check if MessagingLayer is a CustomState variant
 */
export function isCustomState(layer: MessagingLayer): layer is { type: MessagingLayerType.CustomState; text: string; indicator_icon_color: string } {
  return layer.type === MessagingLayerType.CustomState;
}

/**
 * Type guard: Check if MessagingLayer is a presence-related variant
 */
export function isPresenceUpdate(layer: MessagingLayer): boolean {
  return layer.type === MessagingLayerType.Away ||
         layer.type === MessagingLayerType.Online ||
         layer.type === MessagingLayerType.Offline ||
         layer.type === MessagingLayerType.CustomState;
}

/**
 * Type guard: Check if MessagingLayer is a CheckState variant
 */
export function isCheckState(layer: MessagingLayer): layer is { type: MessagingLayerType.CheckState } {
  return layer.type === MessagingLayerType.CheckState;
}

/**
 * Type guard: Check if MessagingLayer is a CheckStateResponse variant
 */
export function isCheckStateResponse(layer: MessagingLayer): layer is { type: MessagingLayerType.CheckStateResponse; ready: true } {
  return layer.type === MessagingLayerType.CheckStateResponse;
}

// ============================================================================
// File Transfer Type Guards
// ============================================================================

/**
 * Type guard: Check if MessagingLayer is a FileTransferRequest variant
 */
export function isFileTransferRequest(layer: MessagingLayer): layer is { type: MessagingLayerType.FileTransferRequest } & FileTransferRequestData {
  return layer.type === MessagingLayerType.FileTransferRequest;
}

/**
 * Type guard: Check if MessagingLayer is a FileTransferResponse variant
 */
export function isFileTransferResponse(layer: MessagingLayer): layer is { type: MessagingLayerType.FileTransferResponse } & FileTransferResponseData {
  return layer.type === MessagingLayerType.FileTransferResponse;
}

/**
 * Type guard: Check if MessagingLayer is a FileTransferProgress variant
 */
export function isFileTransferProgress(layer: MessagingLayer): layer is { type: MessagingLayerType.FileTransferProgress } & FileTransferProgressData {
  return layer.type === MessagingLayerType.FileTransferProgress;
}

/**
 * Type guard: Check if MessagingLayer is a FileTransferComplete variant
 */
export function isFileTransferComplete(layer: MessagingLayer): layer is { type: MessagingLayerType.FileTransferComplete } & FileTransferCompleteData {
  return layer.type === MessagingLayerType.FileTransferComplete;
}

/**
 * Type guard: Check if MessagingLayer is a FileTransferCancel variant
 */
export function isFileTransferCancel(layer: MessagingLayer): layer is { type: MessagingLayerType.FileTransferCancel } & FileTransferCancelData {
  return layer.type === MessagingLayerType.FileTransferCancel;
}

/**
 * Type guard: Check if MessagingLayer is a FileTransferChunk variant
 */
export function isFileTransferChunk(layer: MessagingLayer): layer is { type: MessagingLayerType.FileTransferChunk } & FileTransferChunkData {
  return layer.type === MessagingLayerType.FileTransferChunk;
}

/**
 * Type guard: Check if MessagingLayer is a RevfsOperation variant
 */
export function isRevfsOperation(layer: MessagingLayer): layer is { type: MessagingLayerType.RevfsOperation; operation: import('./revfs-types').RevfsOperation } {
  return layer.type === MessagingLayerType.RevfsOperation;
}

/**
 * Type guard: Check if MessagingLayer is any file transfer-related variant
 */
export function isFileTransferMessage(layer: MessagingLayer): boolean {
  return layer.type === MessagingLayerType.FileTransferRequest ||
         layer.type === MessagingLayerType.FileTransferResponse ||
         layer.type === MessagingLayerType.FileTransferProgress ||
         layer.type === MessagingLayerType.FileTransferComplete ||
         layer.type === MessagingLayerType.FileTransferCancel ||
         layer.type === MessagingLayerType.FileTransferChunk;
}

// ============================================================================
// Helper Constructors
// ============================================================================

/**
 * Create a Message variant
 */
export function createMessage(contents: string, timestamp?: number): MessagingLayer {
  return {
    type: MessagingLayerType.Message,
    contents,
    timestamp: timestamp ?? Date.now()
  };
}

/**
 * Create a Typing variant
 */
export function createTyping(): MessagingLayer {
  return { type: MessagingLayerType.Typing };
}

/**
 * Create an Away variant
 */
export function createAway(): MessagingLayer {
  return { type: MessagingLayerType.Away };
}

/**
 * Create an Online variant
 */
export function createOnline(): MessagingLayer {
  return { type: MessagingLayerType.Online };
}

/**
 * Create an Offline variant
 */
export function createOffline(): MessagingLayer {
  return { type: MessagingLayerType.Offline };
}

/**
 * Create a CustomState variant
 * @param text - Status text to display
 * @param indicator_icon_color - Hex color string (e.g., "#ff0000")
 */
export function createCustomState(text: string, indicator_icon_color: string): MessagingLayer {
  return {
    type: MessagingLayerType.CustomState,
    text,
    indicator_icon_color
  };
}

/**
 * Create a CheckState request - sent before messaging to verify P2P channel is active
 */
export function createCheckState(): MessagingLayer {
  return { type: MessagingLayerType.CheckState };
}

/**
 * Create a CheckStateResponse - always returns Ready
 * Even if we believe peer is ready, we respond Ready to ensure robustness
 */
export function createCheckStateResponse(): MessagingLayer {
  return { type: MessagingLayerType.CheckStateResponse, ready: true };
}

// ============================================================================
// File Transfer Helper Constructors
// ============================================================================

/**
 * Create a FileTransferRequest variant
 * @param file_name - Name of the file being transferred
 * @param file_size - Size in bytes
 * @param file_type - MIME type of the file
 * @param transfer_mode - 'async' for server-mediated, 'p2p' for direct
 * @param options - Optional parameters (thumbnail, virtual_path, expiry)
 */
export function createFileTransferRequest(
  file_name: string,
  file_size: number,
  file_type: string,
  transfer_mode: FileTransferMode,
  options?: {
    transfer_id?: string;
    thumbnail?: string;
    virtual_path?: string;
    expiry_timestamp?: number;
  }
): MessagingLayer {
  return {
    type: MessagingLayerType.FileTransferRequest,
    transfer_id: options?.transfer_id ?? crypto.randomUUID(),
    file_name,
    file_size,
    file_type,
    thumbnail: options?.thumbnail,
    transfer_mode,
    virtual_path: options?.virtual_path,
    expiry_timestamp: options?.expiry_timestamp,
    timestamp: Date.now()
  };
}

/**
 * Create a FileTransferResponse variant
 * @param transfer_id - ID of the transfer being responded to
 * @param accepted - Whether the transfer was accepted
 * @param decline_reason - Optional reason for declining
 */
export function createFileTransferResponse(
  transfer_id: string,
  accepted: boolean,
  decline_reason?: string
): MessagingLayer {
  return {
    type: MessagingLayerType.FileTransferResponse,
    transfer_id,
    accepted,
    decline_reason,
    timestamp: Date.now()
  };
}

/**
 * Create a FileTransferProgress variant
 * @param transfer_id - ID of the transfer
 * @param bytes_transferred - Bytes transferred so far
 * @param total_bytes - Total size of file
 */
export function createFileTransferProgress(
  transfer_id: string,
  bytes_transferred: number,
  total_bytes: number
): MessagingLayer {
  return {
    type: MessagingLayerType.FileTransferProgress,
    transfer_id,
    bytes_transferred,
    total_bytes,
    percentage: Math.round((bytes_transferred / total_bytes) * 100),
    timestamp: Date.now()
  };
}

/**
 * Create a FileTransferComplete variant
 * @param transfer_id - ID of the transfer
 * @param success - Whether the transfer completed successfully
 * @param options - Optional download_path or error_message
 */
export function createFileTransferComplete(
  transfer_id: string,
  success: boolean,
  options?: {
    download_path?: string;
    error_message?: string;
  }
): MessagingLayer {
  return {
    type: MessagingLayerType.FileTransferComplete,
    transfer_id,
    success,
    download_path: options?.download_path,
    error_message: options?.error_message,
    timestamp: Date.now()
  };
}

/**
 * Create a FileTransferCancel variant
 * @param transfer_id - ID of the transfer to cancel
 * @param reason - Optional reason for cancellation
 */
export function createFileTransferCancel(
  transfer_id: string,
  reason?: string
): MessagingLayer {
  return {
    type: MessagingLayerType.FileTransferCancel,
    transfer_id,
    reason,
    timestamp: Date.now()
  };
}

/**
 * Create a FileTransferChunk variant for P2P streaming
 * @param transfer_id - ID of the transfer
 * @param chunk_index - 0-based index of this chunk
 * @param total_chunks - Total number of chunks for the file
 * @param data - Base64-encoded chunk data
 * @param checksum - Optional SHA-256 hash of chunk data
 */
export function createFileTransferChunk(
  transfer_id: string,
  chunk_index: number,
  total_chunks: number,
  data: string,
  checksum?: string
): MessagingLayer {
  return {
    type: MessagingLayerType.FileTransferChunk,
    transfer_id,
    chunk_index,
    total_chunks,
    data,
    checksum,
    timestamp: Date.now()
  };
}

/**
 * Create a RevfsOperation variant
 */
export function createRevfsOperation(operation: import('./revfs-types').RevfsOperation): MessagingLayer {
  return {
    type: MessagingLayerType.RevfsOperation,
    operation,
  };
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Serialize a MessagingLayer to JSON string for transport
 */
export function serializeMessagingLayer(layer: MessagingLayer): string {
  return JSON.stringify(layer);
}

/**
 * Deserialize a JSON string to MessagingLayer
 * @throws Error if parsing fails or type is invalid
 */
export function deserializeMessagingLayer(json: string): MessagingLayer {
  const parsed = JSON.parse(json);

  if (!parsed || typeof parsed !== 'object' || !parsed.type) {
    throw new Error('Invalid MessagingLayer: missing type field');
  }

  // Validate the type is a known MessagingLayerType
  if (!Object.values(MessagingLayerType).includes(parsed.type)) {
    throw new Error(`Invalid MessagingLayer type: ${parsed.type}`);
  }

  // Type-specific validation
  switch (parsed.type) {
    case MessagingLayerType.Message:
      if (typeof parsed.contents !== 'string') {
        throw new Error('Invalid Message: contents must be a string');
      }
      if (typeof parsed.timestamp !== 'number') {
        throw new Error('Invalid Message: timestamp must be a number');
      }
      break;
    case MessagingLayerType.CustomState:
      if (typeof parsed.text !== 'string') {
        throw new Error('Invalid CustomState: text must be a string');
      }
      if (typeof parsed.indicator_icon_color !== 'string') {
        throw new Error('Invalid CustomState: indicator_icon_color must be a string');
      }
      break;
  }

  return parsed as MessagingLayer;
}

// ============================================================================
// Typing Indicator Constants
// ============================================================================

/** How often to poll for typing changes (ms) */
export const TYPING_POLL_INTERVAL_MS = 1000;

/** How long to display typing indicator after receiving (ms) */
export const TYPING_DISPLAY_DURATION_MS = 2000;

// ============================================================================
// File Transfer Constants
// ============================================================================

/** Default TTL for file transfer requests (7 days in ms) */
export const FILE_TRANSFER_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How often to check for expired file transfers (6 hours in ms) */
export const FILE_TRANSFER_EXPIRY_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Maximum number of auto-resend attempts for file transfer requests */
export const FILE_TRANSFER_MAX_RESEND_ATTEMPTS = 3;

/** Default max file size for transfers (100 MB) */
export const FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024;

/** Default RE-VFS storage quota per peer (100 MB) */
export const REVFS_DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024;

// ============================================================================
// P2P Chunk Streaming Constants
// ============================================================================

/** Default chunk size for P2P file streaming (64 KB) - optimized for WebSocket frames */
export const FILE_TRANSFER_CHUNK_SIZE_BYTES = 64 * 1024;

/** Maximum chunk size allowed (256 KB) */
export const FILE_TRANSFER_MAX_CHUNK_SIZE_BYTES = 256 * 1024;

/** Timeout for receiving next chunk (30 seconds) */
export const FILE_TRANSFER_CHUNK_TIMEOUT_MS = 30 * 1000;

/** Maximum number of chunk retries before failing transfer */
export const FILE_TRANSFER_CHUNK_MAX_RETRIES = 3;
