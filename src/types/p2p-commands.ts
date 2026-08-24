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



// Re-export MessagingLayer types for convenience
export type { MessagingLayer } from './messaging-layer';
export { MessagingLayerType } from './messaging-layer';

export enum P2PCommandType {
  MessagingLayerCommand = "MessagingLayerCommand",
  MessageAck = "MessageAck",
  FileTransferRequest = "FileTransferRequest",
  FileTransferChunk = "FileTransferChunk",
  FileTransferComplete = "FileTransferComplete",
  /** Wraps a `YjsP2PMessage` (sync / awareness / ack / divergence) so the
   * Yjs collaborative-editor protocol shares the same CBOR envelope as
   * the chat-layer P2P commands. Before this variant existed, the Yjs
   * provider used `JSON.stringify` on the raw `YjsP2PMessage` and the
   * unified receiver (`message-handler.ts`) tried `cborDecode` on the
   * resulting UTF-8 bytes — every Yjs message logged a noisy
   * "Failed to deserialize P2P command" and the test:live-doc
   * integration test never reached a stable sync state. Routing Yjs
   * through `P2PCommand` makes one decode path the single source of
   * truth and drops the wire-format ambiguity entirely. */
  YjsP2PSync = "YjsP2PSync",
  /** Call control: invite, accept, decline, end, and in-call state changes.
   *
   * Signalling rides the RELIABLE path deliberately, while the media it sets up
   * rides the lossy UDP one. The two have opposite requirements: losing a video
   * frame costs a sixtieth of a second, losing a "call ended" leaves both sides
   * staring at a call that is over. */
  CallSignal = "CallSignal"
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

/**
 * Wire-level payload for `P2PCommandType.YjsP2PSync`. Holds the
 * unmodified `YjsP2PMessage` discriminated union from the Yjs
 * provider — kept as a structural type rather than importing
 * `YjsP2PMessage` directly to avoid a `src/lib` → `src/types`
 * dependency cycle (lib/yjs-p2p-provider/types.ts already imports
 * from this file's siblings transitively). The matching round-trip
 * is pinned in `__tests__/p2p-commands-yjs.test.ts` and exercised
 * end-to-end by integration-tests test:live-doc.
 */
export interface P2PYjsSyncPayload {
  /** Discriminator from `YjsP2PMessage.type`: 'yjs_sync' | 'yjs_awareness' | 'yjs_ack' | 'yjs_divergence' */
  type: string;
  /** Document the message refers to (when applicable). */
  document_id?: string;
  /** All other fields from the YjsP2PMessage; CBOR preserves bigint, number arrays, etc. */
  [key: string]: unknown;
}

export interface P2PAttachment {
  file_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  thumbnail?: string;
}

/** Which media a participant is contributing. */
export interface CallMediaKinds {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

/** What a peer can decode, so the SENDER can pick something it can play.
 *
 * Decode support is consistently broader than encode support, so negotiating on
 * the receiver's decode list is what lets each sender use its best available
 * encoder instead of collapsing everyone to a common denominator.
 */
export interface CallCodecCapabilities {
  audio: string[];
  video: Array<{ codec: string; hardware: boolean; maxHeight: number }>;
}

export type CallDeclineReason = 'busy' | 'rejected' | 'unsupported' | 'no-devices';
export type CallEndReason = 'hangup' | 'error' | 'timeout' | 'unanswered';

/** Track numbering, shared with the Rust transport's TrackId. */
export const CALL_TRACK_AUDIO = 0;
export const CALL_TRACK_VIDEO = 1;
/** Low-resolution video, sent to everyone who is not the active speaker. */
export const CALL_TRACK_VIDEO_THUMBNAIL = 2;

/** TrackKind on the wire: matches citadel_media's TrackKind discriminants. */
export const CALL_KIND_AUDIO = 0;
export const CALL_KIND_VIDEO = 1;

/** FrameFlags bits, matching citadel_media::FrameFlags. */
export const CALL_FLAG_KEYFRAME = 0b0001;
export const CALL_FLAG_DISCARDABLE = 0b0010;

export type CallSignalPayload =
  | {
      kind: 'CallInvite';
      call_id: string;
      media: CallMediaKinds;
      codecs: CallCodecCapabilities;
      /** Bumped when the frame wire format changes. A peer that does not
       * recognise it declines as 'unsupported' instead of decoding garbage. */
      media_wire_version: number;
      /** Present for a group call: everyone the caller is inviting, so each
       * participant can build the same mesh without a central authority. */
      group?: { room_id: string; members: string[] };
      /** The codec this sender will ENCODE with, so the receiver can configure
       * its decoder for what actually arrives instead of guessing from its own
       * encoder preference — which breaks the moment the two machines differ.
       * Optional for wire compatibility with peers that predate it. */
      video_send_codec?: string | null;
    }
  | { kind: 'CallAccept'; call_id: string; codecs: CallCodecCapabilities; media: CallMediaKinds; video_send_codec?: string | null }
  | { kind: 'CallDecline'; call_id: string; reason: CallDeclineReason }
  | { kind: 'CallEnd'; call_id: string; reason: CallEndReason }
  /** Mic/camera/screen toggled, so the far side can show the right tile state
   * instead of inferring it from a stream that simply stopped arriving.
   * Also carries a renegotiated send codec: the caller only learns the callee's
   * decode list from the accept, so its invite-time codec choice may change. */
  | { kind: 'CallMediaState'; call_id: string; media: CallMediaKinds; video_send_codec?: string | null }
  /** Sent after a gap: the decoder cannot recover until a keyframe arrives. */
  | { kind: 'CallKeyframeRequest'; call_id: string; track: number };

export interface P2PCommand {
  type: P2PCommandType;
  payload: P2PMessagingLayerPayload | P2PMessageAckPayload |
           P2PFileTransferRequestPayload | P2PFileTransferChunkPayload | P2PFileTransferCompletePayload |
           P2PYjsSyncPayload | CallSignalPayload;
}

export function isCallSignalPayload(payload: unknown): payload is CallSignalPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    'call_id' in payload &&
    typeof (payload as { kind: unknown }).kind === 'string' &&
    (payload as { kind: string }).kind.startsWith('Call')
  );
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

/** Yjs sync payload always carries a string `type` field starting with `yjs_`. */
export function isYjsSyncPayload(payload: unknown): payload is P2PYjsSyncPayload {
  return typeof payload === 'object' && payload !== null &&
    'type' in payload && typeof (payload as { type: unknown }).type === 'string' &&
    ((payload as { type: string }).type).startsWith('yjs_');
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
