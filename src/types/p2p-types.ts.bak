/**
 * P2P Command Types for peer-to-peer messaging
 * These types mirror the Rust enum structure for P2P communication
 *
 * Serialization: Uses CBOR (cbor-x) for native BigInt support.
 * CIDs are stored as bigint - no string conversion needed.
 * CBOR handles BigInt natively via CBOR tags 2/3.
 */

import { encode as cborEncode, decode as cborDecode } from 'cbor-x';
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
 * CIDs are native bigint - bincode-ts handles serialization natively via u64.
 */
export interface P2PMessagingLayerPayload {
  /** The serialized MessagingLayer data */
  layer: MessagingLayer;
  /** Sender's connection ID (native bigint) */
  sender_cid: bigint;
  /** Recipient's connection ID (native bigint) */
  recipient_cid: bigint;
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
    sender_cid: bigint;
    recipient_cid: bigint;
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
export function isMessagingLayerPayload(payload: unknown): payload is P2PMessagingLayerPayload {
  return typeof payload === 'object' && payload !== null && 'layer' in payload && 'sender_cid' in payload && 'recipient_cid' in payload;
}

export function isMessageAckPayload(payload: unknown): payload is P2PMessageAckPayload {
  return typeof payload === 'object' && payload !== null && 'ack_type' in payload && 'message_id' in payload;
}

export function isFileTransferRequestPayload(payload: unknown): payload is P2PFileTransferRequestPayload {
  return typeof payload === 'object' && payload !== null && 'file_id' in payload && 'total_chunks' in payload;
}

export function isFileTransferChunkPayload(payload: unknown): payload is P2PFileTransferChunkPayload {
  return typeof payload === 'object' && payload !== null && 'file_id' in payload && 'chunk_index' in payload && 'chunk_data' in payload;
}

export function isFileTransferCompletePayload(payload: unknown): payload is P2PFileTransferCompletePayload {
  return typeof payload === 'object' && payload !== null && 'file_id' in payload && 'success' in payload && 'final_checksum' in payload;
}

// Helper functions for creating P2P commands

/**
 * Create a MessagingLayerCommand with the given layer payload.
 * CIDs are native bigint - bincode-ts handles serialization natively.
 */
export function createMessagingLayerCommand(
  layer: MessagingLayer,
  senderCid: bigint,
  recipientCid: bigint,
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
      // Native bigint - no conversion needed
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

// Message serialization/deserialization using CBOR (cbor-x)
// CBOR provides native BigInt support via tags 2/3, no string conversion needed

/**
 * Serialize a P2P command to Uint8Array using CBOR.
 * Native BigInt support - CIDs are serialized directly as 64-bit integers.
 */
export function serializeP2PCommand(command: P2PCommand): Uint8Array {
  return cborEncode(command);
}

/**
 * Deserialize a P2P command from Uint8Array using CBOR.
 * BigInt values are automatically restored.
 */
export function deserializeP2PCommand(data: Uint8Array): P2PCommand {
  return cborDecode(data) as P2PCommand;
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
export function isYjsSyncMessage(msg: unknown): msg is YjsSyncMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg && (msg as YjsSyncMessage).type === 'yjs_sync' && 'sub_type' in msg && 'document_id' in msg;
}

/**
 * Type guard for YJS awareness messages
 */
export function isYjsAwarenessMessage(msg: unknown): msg is YjsAwarenessMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg && (msg as YjsAwarenessMessage).type === 'yjs_awareness' && 'awareness' in msg;
}

/**
 * Type guard for YJS ACK messages
 */
export function isYjsAckMessage(msg: unknown): msg is YjsAckMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg && (msg as YjsAckMessage).type === 'yjs_ack' && 'message_id' in msg && 'local_hash' in msg;
}

/**
 * Type guard for YJS divergence messages
 */
export function isYjsDivergenceMessage(msg: unknown): msg is YjsDivergenceMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg && (msg as YjsDivergenceMessage).type === 'yjs_divergence' && 'action' in msg;
}

/**
 * Check if a message is a YJS P2P message
 */
export function isYjsP2PMessage(msg: unknown): msg is YjsP2PMessage {
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
