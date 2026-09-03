/**
 * Types for useRevfsTree and useServerRevfsTree hooks.
 */

import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';

/** Default storage quota: 100 MB */
export const DEFAULT_QUOTA_BYTES: number = 100 * 1024 * 1024;

/**
 * A mutating operation answers whether the change reached its destination --
 * the peer acknowledged it, or the server accepted it. NOT whether the local
 * tree changed, which it did either way and which is persisted regardless.
 *
 * These were `Promise<void>`, and `sendAndAwaitAck` grew a boolean return so
 * that an unacknowledged operation would stop being invisible. That flag was
 * discarded by every peer op, so the file manager announced folders created and
 * files removed on peers that had never heard of them. A `void` here makes the
 * honest report structurally impossible.
 */
export interface UseRevfsTreeResult {
  tree: RevfsNode | null;
  loading: boolean;
  error: string | null;
  /** Storage currently used by hosted files (bytes) */
  storageUsed: number;
  /** Storage quota limit (bytes) */
  storageQuota: number;
  /** Whether RE-VFS is enabled for this peer (local settings) */
  revfsEnabled: boolean;
  mkdir: (path: string) => Promise<boolean>;
  rmdir: (path: string) => Promise<boolean>;
  uploadFile: (dirPath: string, fileName: string, metadata: RevfsFileMetadata, content: Uint8Array) => Promise<boolean>;
  downloadFile: (filePath: string) => Promise<string | undefined>;
  removeFile: (filePath: string) => Promise<boolean>;
  /** Rename a file or directory */
  rename: (path: string, newName: string) => Promise<boolean>;
  /** Move a file or directory to a new parent directory */
  move: (sourcePath: string, destParentPath: string) => Promise<boolean>;
  /** Copy a file or directory to a new parent directory */
  copy: (sourcePath: string, destParentPath: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export interface UseServerRevfsTreeResult {
  tree: RevfsNode | null;
  loading: boolean;
  error: string | null;
  /** Storage currently used by server-stored files (bytes) */
  storageUsed: number;
  /** Storage quota limit (bytes) */
  storageQuota: number;
  /** Whether server RE-VFS is enabled (defaults to true until we query server) */
  revfsEnabled: boolean;
  mkdir: (path: string) => Promise<boolean>;
  rmdir: (path: string) => Promise<boolean>;
  uploadFile: (dirPath: string, fileName: string, metadata: RevfsFileMetadata, content: Uint8Array) => Promise<boolean>;
  downloadFile: (filePath: string) => Promise<string | undefined>;
  removeFile: (filePath: string) => Promise<boolean>;
  /** Rename a file or directory */
  rename: (path: string, newName: string) => Promise<boolean>;
  /** Move a file or directory to a new parent directory */
  move: (sourcePath: string, destParentPath: string) => Promise<boolean>;
  /** Copy a file or directory to a new parent directory */
  copy: (sourcePath: string, destParentPath: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/** Server capabilities state */
export interface ServerCapabilities {
  allowServerFileTransfer: boolean;
  allowServerRevfsStorage: boolean;
  maxFileTransferSizeMb: number;
  revfsStorageQuotaMb: number;
}

/** Default server capabilities (assume enabled until queried) */
export const DEFAULT_SERVER_CAPABILITIES: ServerCapabilities = {
  allowServerFileTransfer: true,
  allowServerRevfsStorage: true,
  maxFileTransferSizeMb: 100,
  revfsStorageQuotaMb: 100,
};
