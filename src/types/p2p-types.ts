/**
 * P2P Command Types for peer-to-peer messaging
 * These types mirror the Rust enum structure for P2P communication
 */

import type { MessageType } from './message-protocol';
import type { MessagingLayer } from './messaging-layer';
import {
  MessagingLayerType,
  serializeMessagingLayer,
  deserializeMessagingLayer
} from './messaging-layer';

// Re-export MessagingLayer types for convenience
export type { MessagingLayer } from './messaging-layer';
export { MessagingLayerType } from './messaging-layer';

export enum P2PCommandType {
  /** MessagingLayer command - carries all messaging protocol variants */
  MessagingLayerCommand = "MessagingLayerCommand",
  /** Acknowledgment for delivered/read messages */
  MessageAck = "MessageAck",
  /** File transfer initiation request */
  FileTransferRequest = "FileTransferRequest",
  /** File transfer data chunk */
  FileTransferChunk = "FileTransferChunk",
  /** File transfer completion notification */
  FileTransferComplete = "FileTransferComplete"
}

/**
 * Payload for MessagingLayerCommand - wraps a MessagingLayer with metadata
 */
export interface P2PMessagingLayerPayload {
  /** The serialized MessagingLayer data */
  layer: MessagingLayer;
  /** Sender's connection ID */
  sender_cid: string;
  /** Recipient's connection ID */
  recipient_cid: string;
  /** Unique message ID for acks */
  message_id: string;
  /** Message index for ordering (only relevant for Message type) */
  index: number;
  /** Optional reference to another message (for replies) */
  reply_to?: string;
  /** Optional user mentions */
  mentions?: string[];
  /** Optional file attachments */
  attachments?: P2PAttachment[];
  /** Message content type (text, markdown, live_document) */
  message_type?: MessageType;
  /** Live document ID (only for live_document type) */
  document_id?: string;
  /** Live document title (only for live_document type) */
  document_title?: string;
}

export interface P2PMessageAckPayload {
  ack_type: "delivered" | "read" | "failed";
  message_id: string;
  timestamp: number;
  error?: string; // Optional error message for failed deliveries
}

export interface P2PFileTransferRequestPayload {
  file_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  chunk_size: number;
  total_chunks: number;
  metadata: {
    sender_cid: string;
    recipient_cid: string;
    timestamp: number;
  };
}

export interface P2PFileTransferChunkPayload {
  file_id: string;
  chunk_index: number;
  chunk_data: Uint8Array;
  checksum: string; // For integrity verification
}

export interface P2PFileTransferCompletePayload {
  file_id: string;
  success: boolean;
  error?: string;
  final_checksum: string;
}

export interface P2PAttachment {
  file_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  thumbnail?: string; // Base64 encoded thumbnail for images
}

// Main P2P Command structure
export interface P2PCommand {
  type: P2PCommandType;
  payload: P2PMessagingLayerPayload | P2PMessageAckPayload |
           P2PFileTransferRequestPayload | P2PFileTransferChunkPayload | P2PFileTransferCompletePayload;
}

// Type guards for payload discrimination
export function isMessagingLayerPayload(payload: any): payload is P2PMessagingLayerPayload {
  return 'layer' in payload && 'sender_cid' in payload && 'recipient_cid' in payload;
}

export function isMessageAckPayload(payload: any): payload is P2PMessageAckPayload {
  return 'ack_type' in payload && 'message_id' in payload;
}

export function isFileTransferRequestPayload(payload: any): payload is P2PFileTransferRequestPayload {
  return 'file_id' in payload && 'total_chunks' in payload;
}

export function isFileTransferChunkPayload(payload: any): payload is P2PFileTransferChunkPayload {
  return 'file_id' in payload && 'chunk_index' in payload && 'chunk_data' in payload;
}

export function isFileTransferCompletePayload(payload: any): payload is P2PFileTransferCompletePayload {
  return 'file_id' in payload && 'success' in payload && 'final_checksum' in payload;
}

// Helper functions for creating P2P commands

/**
 * Create a MessagingLayerCommand with the given layer payload
 */
export function createMessagingLayerCommand(
  layer: MessagingLayer,
  senderCid: string,
  recipientCid: string,
  index: number,
  options?: {
    messageId?: string;
    replyTo?: string;
    mentions?: string[];
    attachments?: P2PAttachment[];
    messageType?: MessageType;
    documentId?: string;
    documentTitle?: string;
  }
): P2PCommand {
  return {
    type: P2PCommandType.MessagingLayerCommand,
    payload: {
      layer,
      sender_cid: senderCid,
      recipient_cid: recipientCid,
      message_id: options?.messageId ?? crypto.randomUUID(),
      index,
      reply_to: options?.replyTo,
      mentions: options?.mentions,
      attachments: options?.attachments,
      message_type: options?.messageType || 'text',
      document_id: options?.documentId,
      document_title: options?.documentTitle
    } as P2PMessagingLayerPayload
  };
}

export function createMessageAckCommand(
  messageId: string,
  ackType: "delivered" | "read" | "failed",
  error?: string
): P2PCommand {
  return {
    type: P2PCommandType.MessageAck,
    payload: {
      ack_type: ackType,
      message_id: messageId,
      timestamp: Date.now(),
      error
    } as P2PMessageAckPayload
  };
}

// Message serialization/deserialization for storage
export function serializeP2PCommand(command: P2PCommand): string {
  return JSON.stringify(command, (key, value) => {
    // Convert Uint8Array to base64 for JSON serialization
    if (value instanceof Uint8Array) {
      return {
        _type: 'Uint8Array',
        data: btoa(String.fromCharCode(...value))
      };
    }
    return value;
  });
}

export function deserializeP2PCommand(json: string): P2PCommand {
  return JSON.parse(json, (key, value) => {
    // Convert base64 back to Uint8Array
    if (value && typeof value === 'object' && value._type === 'Uint8Array') {
      const binary = atob(value.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return value;
  });
}

// ============================================
// YJS SYNC MESSAGE TYPES
// ============================================

/**
 * Sub-types for YJS sync protocol messages
 */
export type YjsSyncSubType =
  | 'sync_step1'      // Initial state vector exchange
  | 'sync_step2'      // Differential update
  | 'update'          // Live document update
  | 'ack'             // Acknowledgment with hash
  | 'hash_check'      // Request hash verification
  | 'full_state'      // Full state for creator authority resync
  | 'request_full';   // Request full state from creator

/**
 * YJS document sync message
 */
export interface YjsSyncMessage {
  type: 'yjs_sync';
  sub_type: YjsSyncSubType;
  document_id: string;
  /** YJS update data as array (Uint8Array converted) */
  data: number[];
  /** SHA-256 hash of current document state */
  doc_hash?: string;
  /** Document revision counter */
  revision?: number;
  /** Unique message ID for ACK tracking */
  message_id: string;
  /** Whether this message expects an ACK response */
  requires_ack?: boolean;
  /** Whether sender is the document creator (authority) */
  is_creator?: boolean;
}

/**
 * YJS awareness message (cursor positions, user info)
 */
export interface YjsAwarenessMessage {
  type: 'yjs_awareness';
  document_id: string;
  /** Awareness update data as array */
  awareness: number[];
}

/**
 * YJS acknowledgment message
 */
export interface YjsAckMessage {
  type: 'yjs_ack';
  document_id: string;
  /** ID of the message being acknowledged */
  message_id: string;
  /** Hash of local document state after applying update */
  local_hash: string;
  /** Local revision number */
  revision: number;
}

/**
 * YJS divergence notification message
 */
export interface YjsDivergenceMessage {
  type: 'yjs_divergence';
  document_id: string;
  /** Local document hash */
  local_hash: string;
  /** Remote document hash that caused divergence detection */
  remote_hash: string;
  /** Indices of diverged chunks (if using Merkle tree) */
  diverged_chunks?: number[];
  /** Action to take for recovery */
  action: 'request_chunks' | 'full_resync';
}

/**
 * Union type for all YJS P2P messages
 */
export type YjsP2PMessage = YjsSyncMessage | YjsAwarenessMessage | YjsAckMessage | YjsDivergenceMessage;

/**
 * Type guard for YJS sync messages
 */
export function isYjsSyncMessage(msg: any): msg is YjsSyncMessage {
  return msg?.type === 'yjs_sync' && 'sub_type' in msg && 'document_id' in msg;
}

/**
 * Type guard for YJS awareness messages
 */
export function isYjsAwarenessMessage(msg: any): msg is YjsAwarenessMessage {
  return msg?.type === 'yjs_awareness' && 'awareness' in msg;
}

/**
 * Type guard for YJS ACK messages
 */
export function isYjsAckMessage(msg: any): msg is YjsAckMessage {
  return msg?.type === 'yjs_ack' && 'message_id' in msg && 'local_hash' in msg;
}

/**
 * Type guard for YJS divergence messages
 */
export function isYjsDivergenceMessage(msg: any): msg is YjsDivergenceMessage {
  return msg?.type === 'yjs_divergence' && 'action' in msg;
}

/**
 * Check if a message is any type of YJS P2P message
 */
export function isYjsP2PMessage(msg: any): msg is YjsP2PMessage {
  return isYjsSyncMessage(msg) || isYjsAwarenessMessage(msg) ||
         isYjsAckMessage(msg) || isYjsDivergenceMessage(msg);
}

// ============================================
// MERKLE TREE TYPES FOR P2P SYNC
// ============================================

/**
 * Serialized chunk for network transmission
 */
export interface SerializedChunk {
  index: number;
  hash: string;
  data: number[]; // Uint8Array as array for JSON
}

/**
 * Merkle proof for verification and comparison
 */
export interface MerkleProof {
  rootHash: string;
  leafCount: number;
  treeHeight: number;
  /** Node hashes by level (0 = root) */
  levelHashes: string[][];
  /** Optional chunks for targeted sync */
  chunks?: SerializedChunk[];
}

/**
 * YJS-specific Merkle proof with document metadata
 */
export interface YjsMerkleProof extends MerkleProof {
  documentId: string;
  creatorCid: string | null;
  revision: number;
}

/**
 * Revision entry for hash chain
 */
export interface RevisionEntry {
  revision: number;
  rootHash: string;
  timestamp: number;
  prevHash?: string;
}
