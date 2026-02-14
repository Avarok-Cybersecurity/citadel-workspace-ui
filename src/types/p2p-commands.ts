/**
 * P2P Command Types for peer-to-peer messaging
 * These types mirror the Rust enum structure for P2P communication
 *
 * Serialization: Uses CBOR (cbor-x) for native BigInt support.
 * CIDs are stored as bigint - no string conversion needed.
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
  MessagingLayerCommand = "MessagingLayerCommand",
  MessageAck = "MessageAck",
  FileTransferRequest = "FileTransferRequest",
  FileTransferChunk = "FileTransferChunk",
  FileTransferComplete = "FileTransferComplete"
}

export interface P2PMessagingLayerPayload {
  layer: MessagingLayer;
  sender_cid: bigint;
  recipient_cid: bigint;
  message_id: string;
  index: number;
  reply_to?: string;
  mentions?: string[];
  attachments?: P2PAttachment[];
  message_type?: MessageType;
  document_id?: string;
  document_title?: string;
}

export interface P2PMessageAckPayload {
  ack_type: "delivered" | "read" | "failed";
  message_id: string;
  timestamp: number;
  error?: string;
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
  checksum: string;
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
  thumbnail?: string;
}

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

// CBOR serialization/deserialization

export function serializeP2PCommand(command: P2PCommand): Uint8Array {
  return cborEncode(command);
}

export function deserializeP2PCommand(data: Uint8Array): P2PCommand {
  return cborDecode(data) as P2PCommand;
}
