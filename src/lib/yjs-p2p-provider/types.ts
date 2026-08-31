/**
 * YJS P2P Provider - Type Definitions
 *
 * Message types, sync state machine types, and interfaces
 * for the YJS P2P sync protocol.
 */

// ============================================
// MESSAGE TYPES
// ============================================

/** Pinch point: Yjs origin values used in this codebase. Replaces Yjs's `any`. */
export type YjsOrigin = string | null | undefined;

/**
 * Sync message sub-types for proper protocol handling
 */
export type SyncSubType =
  | 'sync_step1'      // Initial state vector exchange
  | 'sync_step2'      // Differential update
  | 'update'          // Live document update
  | 'ack'             // Acknowledgment with hash
  | 'full_state'      // Full state for creator authority resync
  | 'request_full';   // Request full state from creator
// 'hash_check' was removed: it was the dead half of a protocol with no
// initiator, and its responder replied to a MATCH with another hash_check —
// completing it as written would have shipped an infinite ping-pong. Hash
// verification rides the data-bearing messages instead (doc_hash on
// update/full_state, local_hash on every ACK).

export interface YjsSyncMessage {
  type: 'yjs_sync';
  sub_type: SyncSubType;
  document_id: string;
  data: number[];           // Uint8Array as array
  doc_hash?: string;        // SHA-256 of current state
  revision?: number;        // Revision counter
  message_id: string;       // Unique message ID
  requires_ack?: boolean;   // Whether ACK is expected
  is_creator?: boolean;     // Whether sender is document creator
}

export interface YjsAwarenessMessage {
  type: 'yjs_awareness';
  document_id: string;
  awareness: number[]; // Uint8Array as array
}

export interface YjsAckMessage {
  type: 'yjs_ack';
  document_id: string;
  message_id: string;       // ID of message being acknowledged
  local_hash: string;       // Local document hash after applying
  revision: number;
}

// YjsDivergenceMessage ('yjs_divergence') was removed with its handler: no
// code path anywhere constructed or sent one, so the handler was dead. The
// live divergence signal is a hash mismatch on an update or ACK, which routes
// through handleHashMismatch (ack-checker.ts).
export type YjsP2PMessage =
  | YjsSyncMessage
  | YjsAwarenessMessage
  | YjsAckMessage;

// ============================================
// SYNC STATE MACHINE
// ============================================

export type SyncState =
  | 'idle'
  | 'awaiting_step1_response'
  | 'awaiting_step2_response'
  | 'synced';
// 'diverged' was only ever written by the removed yjs_divergence handler;
// recovery goes straight to full_state/request_full without a resting state.

export interface PendingAck {
  messageId: string;
  sentAt: number;
  expectedHash?: string;
  retryCount: number;
  /**
   * The exact wire message, kept so an ACK timeout can RETRANSMIT it.
   * Without this the "retry" path could only re-arm the timer — a lost
   * update was logged as retried but never resent, then silently abandoned.
   * Same message_id on every attempt: the eventual ACK clears this entry
   * whichever attempt got through, and Yjs update application is idempotent
   * so a duplicate arrival is harmless.
   */
  message: YjsSyncMessage;
}
