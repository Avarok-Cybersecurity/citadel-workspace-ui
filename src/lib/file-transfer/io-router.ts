/**
 * File Transfer I/O Router Interface
 *
 * Abstract interface for file transfer I/O operations.
 * Follows SBIO principle - only performs I/O, no business logic.
 *
 * Implementation:
 * - RealProtocolIORouter: Uses InternalServiceRequest commands (SendFile, etc.)
 */

import type {
  SendFileParams,
  SendFileResult,
  CancelTransferParams,
  RespondTransferParams,
  DownloadFileParams,
  TransferRequestEvent,
  TransferProgressEvent,
  TransferCompleteEvent,
  TransferStatusEvent,
  ChunkData,
  BlobResult,
} from './io-router-types';
import type { FileTransfer } from './types';

/**
 * Abstract interface for file transfer I/O operations.
 *
 * The RealProtocolIORouter implementation uses this interface,
 * allowing the FileTransferService to work with the I/O layer without changing business logic.
 */
export interface IFileTransferIORouter {
  // ============================================================================
  // Send Operations
  // ============================================================================

  /**
   * Send a file to a recipient.
   *
   * Sends a SendFile InternalServiceRequest via the real protocol.
   *
   * @param params - Send file parameters
   * @returns Protocol-level transfer ID and client transfer ID
   */
  sendFile(params: SendFileParams): Promise<SendFileResult>;

  /**
   * Cancel an in-progress transfer.
   *
   * Cleans up local state. The real protocol doesn't have an explicit cancel command;
   * cancellation happens implicitly when either side disconnects.
   *
   * @param params - Cancel parameters
   */
  cancelTransfer(params: CancelTransferParams): Promise<void>;

  /**
   * Send a file chunk (deprecated - not used by real protocol).
   *
   * The Citadel SDK handles chunking automatically. This method exists for
   * interface compatibility but throws an error when called.
   *
   * @param transferId - Transfer ID
   * @param recipientCid - Recipient CID
   * @param chunkIndex - Chunk index (0-based)
   * @param totalChunks - Total number of chunks
   * @param data - Base64 encoded chunk data
   * @deprecated Chunking is handled by the Citadel SDK
   */
  sendChunk(
    transferId: string,
    recipientCid: bigint,
    chunkIndex: number,
    totalChunks: number,
    data: string
  ): Promise<void>;

  /**
   * Send transfer completion notification (deprecated - not used by real protocol).
   *
   * The Citadel SDK signals completion automatically. This method exists for
   * interface compatibility but throws an error when called.
   *
   * @param transferId - Transfer ID
   * @param targetCid - Target CID
   * @param success - Whether transfer was successful
   * @param errorMessage - Error message if failed
   * @deprecated Completion is signaled by the Citadel SDK
   */
  sendComplete(
    transferId: string,
    targetCid: bigint,
    success: boolean,
    errorMessage?: string
  ): Promise<void>;

  // ============================================================================
  // Receive Operations
  // ============================================================================

  /**
   * Respond to an incoming transfer request (accept or decline).
   *
   * Sends a RespondFileTransfer InternalServiceRequest.
   *
   * @param params - Response parameters
   */
  respondToTransfer(params: RespondTransferParams): Promise<void>;

  /**
   * Download a file from server/peer virtual storage.
   *
   * Sends a DownloadFile InternalServiceRequest.
   *
   * @param params - Download parameters
   */
  downloadFile(params: DownloadFileParams): Promise<void>;

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Subscribe to incoming transfer requests.
   *
   * @param callback - Called when a new transfer request is received
   * @returns Unsubscribe function
   */
  onTransferRequest(callback: (event: TransferRequestEvent) => void): () => void;

  /**
   * Subscribe to transfer progress updates.
   *
   * Progress comes from FileTransferTickNotification events.
   *
   * @param callback - Called on progress updates
   * @returns Unsubscribe function
   */
  onProgress(callback: (event: TransferProgressEvent) => void): () => void;

  /**
   * Subscribe to transfer completion events.
   *
   * @param callback - Called when a transfer completes (success or failure)
   * @returns Unsubscribe function
   */
  onComplete(callback: (event: TransferCompleteEvent) => void): () => void;

  /**
   * Subscribe to transfer status changes (accept/decline confirmations).
   *
   * @param callback - Called when transfer status changes
   * @returns Unsubscribe function
   */
  onStatusChange(callback: (event: TransferStatusEvent) => void): () => void;

  // ============================================================================
  // File Utilities
  // ============================================================================

  /**
   * Read a file chunk as base64.
   *
   * @param chunk - Blob chunk to convert
   * @returns Base64 encoded string
   */
  fileChunkToBase64(chunk: Blob): Promise<string>;

  /**
   * Convert base64 string back to binary.
   *
   * @param base64 - Base64 encoded string
   * @returns Binary data
   */
  base64ToBinary(base64: string): Uint8Array;

  /**
   * Create blob from received chunks and generate object URL.
   *
   * @param chunks - Array of received chunks
   * @param fileType - MIME type of the file
   * @returns Blob and object URL for download
   */
  createBlobFromChunks(chunks: ChunkData[], fileType: string): BlobResult;

  /**
   * Generate thumbnail for an image file.
   *
   * @param file - Image file
   * @returns Data URL of thumbnail
   */
  generateThumbnail(file: File): Promise<string>;

  // ============================================================================
  // Context
  // ============================================================================

  /**
   * Get the current session CID.
   *
   * @returns Current CID or null if no session
   */
  getCurrentCid(): Promise<bigint | null>;

  /**
   * Notify state change to external systems (P2P messenger manager, etc.).
   *
   * @param transfer - Updated transfer object
   */
  notifyStateChange(transfer: FileTransfer): void;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Clean up resources (unsubscribe from events, etc.).
   */
  dispose(): void;
}
