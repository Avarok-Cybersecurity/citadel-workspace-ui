/**
 * RE-VFS SBIO Intent Types
 *
 * All I/O operations the RE-VFS service needs are expressed as intents.
 * The I/O router (revfs-io.ts) executes them, keeping business logic pure.
 *
 * Supports both P2P (peer_cid is bigint) and Server (peer_cid is null) scopes.
 */

import type {
  RevfsNode,
  RevfsOperation,
  RevfsPendingOp,
  TreeKey,
} from './revfs-types';

export type RevfsIntent =
  // P2P-only: send operation to peer via P2P messaging
  | { type: 'send-revfs-op'; peerCid: bigint; operation: RevfsOperation }
  // Tree persistence: uses TreeKey (either PeerPairKey or ServerTreeKey)
  | { type: 'persist-tree'; treeKey: TreeKey; tree: RevfsNode }
  | { type: 'load-tree'; treeKey: TreeKey }
  // Pending ops: uses TreeKey (either PeerPairKey or ServerTreeKey)
  | { type: 'persist-pending-ops'; treeKey: TreeKey; ops: RevfsPendingOp[] }
  | { type: 'load-pending-ops'; treeKey: TreeKey }
  // Backend file ops: peerCid is bigint for P2P, null for server storage
  | { type: 'backend-send-file'; cid: bigint; peerCid: bigint | null; source: string; virtualDir: string }
  | { type: 'backend-download-file'; cid: bigint; peerCid: bigint | null; virtualDir: string }
  | { type: 'backend-delete-file'; cid: bigint; peerCid: bigint | null; virtualDir: string };

export type RevfsIntentResult =
  | { type: 'send-revfs-op'; success: boolean }
  | { type: 'persist-tree'; success: boolean }
  | { type: 'load-tree'; tree: RevfsNode | null }
  | { type: 'persist-pending-ops'; success: boolean }
  | { type: 'load-pending-ops'; ops: RevfsPendingOp[] }
  | { type: 'backend-send-file'; success: boolean; virtualDir?: string }
  | { type: 'backend-download-file'; success: boolean; downloadPath?: string }
  | { type: 'backend-delete-file'; success: boolean };
