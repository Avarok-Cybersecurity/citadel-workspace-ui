/**
 * File Transfer Types
 *
 * Type definitions for file transfer functionality.
 */

import type { FileTransferState } from '@/types/messaging-layer';

// ============================================================================
// Core Types
// ============================================================================

export interface FileTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  thumbnail?: string;
  state: FileTransferState;
  progress: number; // 0-100
  senderCid: string;
  recipientCid: string;
  downloadPath?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  isIncoming: boolean; // true if we are the recipient
  /** Who a 'queued' send waits for, by name, for "Will send when {name} is online". */
  waitingFor?: string;
}

export interface FileTransferSettings {
  autoAccept: boolean;
  maxFileSize: number;
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

/**
 * Phantom-branded wrapper marking a value as IN-MEMORY ONLY. The unique
 * symbol can never be produced at runtime, so structural type widening
 * cannot accidentally assign a raw `T` to an `InMemoryOnly<T>` field —
 * callers must go through `wrapInMemory()` which is the single
 * documented escape hatch.
 *
 * Why: the original `file?: File` field carried a non-serializable host
 * object (drops to `{}` under `JSON.stringify`, semantics undefined
 * across `structuredClone` to workers/tabs). A code reviewer flagged
 * that the doc-only contract did not stop a future refactor from
 * routing this intent through a JSON or BroadcastChannel bus and
 * silently losing the file. This brand makes the boundary explicit at
 * the type level: any cross-boundary intent serializer that omits
 * `file` automatically widens to a value that no longer matches
 * `InMemoryOnly<File>` and the executor's lookup branch is forced.
 */
export type InMemoryOnly<T> = T & { readonly __inMemoryOnly: unique symbol };

/**
 * Brand a value as in-memory-only. Cast through this helper at the
 * single legitimate creation site (`transfer-lifecycle.ts`) — anywhere
 * else assigning a raw `File` to `SendTransferRequestIntent.file` is
 * a TypeScript error. The cast itself is zero-cost; the brand exists
 * only at compile time.
 */
export function wrapInMemory<T>(value: T): InMemoryOnly<T> {
  return value as InMemoryOnly<T>;
}

export interface SendTransferRequestIntent {
  type: 'send-transfer-request';
  transfer: FileTransfer;
  /**
   * The actual browser File object to send (browser-based file
   * selection path).
   *
   * Branded `InMemoryOnly<File>` so the type system stops a future
   * refactor that routes this intent through `BroadcastChannel`,
   * `postMessage`, or `JSON.stringify` from silently dropping the File:
   *   - `JSON.stringify(intent)` drops the brand AND the File ⇒ executor
   *     hits the missing-file branch and throws (see io.ts:103-115).
   *   - Direct assignment of a raw `File` is a TS error; callers must
   *     go through `wrapInMemory(file)` so the in-memory-only contract
   *     is explicit at the call site.
   *
   * There is deliberately NO side-channel copy of the File to fall back
   * on: the bytes leave in the same call that carries this intent, so a
   * dispatcher that lost the File has lost the transfer and must fail
   * loudly (io.ts does).
   */
  file?: InMemoryOnly<File>;
  /** True when the sender's own bubble already shows this offer (a held send, released). */
  offerAlreadyShown: boolean;
  /** For a browser file: the staging's stop signal and progress (deliver-send.ts). */
  staging: StagingHooks;
}

export interface StagingHooks {
  signal: AbortSignal;
  onProgress: (stagedBytes: number, totalBytes: number) => void;
  /** The agent holds the whole file: the offer goes out next. */
  onStaged: () => void;
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
  /** It failed here; the peer shows "failed", not "cancelled". */
  failed: boolean;
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
  /**
   * The full transfer record, so the executor can send the in-band
   * announcement that gives the recipient a bubble to accept from. Without
   * it the native-picker path used to issue only the protocol SendFile: the
   * recipient's internal service held an offer no UI ever surfaced, and the
   * sender waited forever on an accept nobody could click.
   */
  transfer: FileTransfer;
  /** Optional PickFile request ID - if provided, uses PickFileRef instead of direct path */
  pickFileRequestId?: string;
}

export type FileTransferIntent =
  | SendTransferRequestIntent
  | SendResponseIntent
  | SendCancelIntent
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
