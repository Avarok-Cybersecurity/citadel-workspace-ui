/**
 * P2P Command Types for peer-to-peer messaging
 * These types mirror the Rust enum structure for P2P communication
 */

export enum P2PCommandType {
  Message = "Message",
  MessageAck = "MessageAck",
  TypingIndicator = "TypingIndicator",
  FileTransferRequest = "FileTransferRequest",
  FileTransferChunk = "FileTransferChunk",
  FileTransferComplete = "FileTransferComplete"
}

export interface P2PMessagePayload {
  message_contents: Uint8Array; // UTF-8 encoded message
  metadata: {
    timestamp: number;
    sender_cid: string;
    recipient_cid: string;
    message_id: string;
    reply_to?: string; // Optional reference to another message
    mentions?: string[]; // Optional user mentions
    attachments?: P2PAttachment[]; // Optional file attachments
  };
  index: number; // Message index for ordering
}

export interface P2PMessageAckPayload {
  ack_type: "delivered" | "read" | "failed";
  message_id: string;
  timestamp: number;
  error?: string; // Optional error message for failed deliveries
}

export interface P2PTypingIndicatorPayload {
  is_typing: boolean;
  sender_cid: string;
  timestamp: number;
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
  payload: P2PMessagePayload | P2PMessageAckPayload | P2PTypingIndicatorPayload | 
           P2PFileTransferRequestPayload | P2PFileTransferChunkPayload | P2PFileTransferCompletePayload;
}

// Type guards for payload discrimination
export function isMessagePayload(payload: any): payload is P2PMessagePayload {
  return 'message_contents' in payload && 'index' in payload;
}

export function isMessageAckPayload(payload: any): payload is P2PMessageAckPayload {
  return 'ack_type' in payload && 'message_id' in payload;
}

export function isTypingIndicatorPayload(payload: any): payload is P2PTypingIndicatorPayload {
  return 'is_typing' in payload && 'sender_cid' in payload;
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
export function createMessageCommand(
  message: string,
  senderCid: string,
  recipientCid: string,
  index: number,
  replyTo?: string,
  mentions?: string[],
  attachments?: P2PAttachment[]
): P2PCommand {
  const encoder = new TextEncoder();
  return {
    type: P2PCommandType.Message,
    payload: {
      message_contents: encoder.encode(message),
      metadata: {
        timestamp: Date.now(),
        sender_cid: senderCid,
        recipient_cid: recipientCid,
        message_id: crypto.randomUUID(),
        reply_to: replyTo,
        mentions,
        attachments
      },
      index
    } as P2PMessagePayload
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

export function createTypingIndicatorCommand(
  isTyping: boolean,
  senderCid: string
): P2PCommand {
  return {
    type: P2PCommandType.TypingIndicator,
    payload: {
      is_typing: isTyping,
      sender_cid: senderCid,
      timestamp: Date.now()
    } as P2PTypingIndicatorPayload
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

// Message decoding helper
export function decodeMessageContents(contents: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(contents);
}