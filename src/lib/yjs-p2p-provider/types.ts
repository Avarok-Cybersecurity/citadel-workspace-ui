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
  | 'hash_check'      // Request hash verification
  | 'full_state'      // Full state for creator authority resync
  | 'request_full';   // Request full state from creator

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

export interface YjsDivergenceMessage {
  type: 'yjs_divergence';
  document_id: string;
  local_hash: string;
  remote_hash: string;
  diverged_chunks?: number[];
  action: 'request_chunks' | 'full_resync';
}

export type YjsP2PMessage =
  | YjsSyncMessage
  | YjsAwarenessMessage
  | YjsAckMessage
  | YjsDivergenceMessage;

// ============================================
// SYNC STATE MACHINE
// ============================================

export type SyncState =
  | 'idle'
  | 'awaiting_step1_response'
  | 'awaiting_step2_response'
  | 'synced'
  | 'diverged';

export interface PendingAck {
  messageId: string;
  sentAt: number;
  expectedHash?: string;
  retryCount: number;
}
