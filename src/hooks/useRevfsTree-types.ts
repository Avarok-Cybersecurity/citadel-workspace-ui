/**
 * Types for useRevfsTree and useServerRevfsTree hooks.
 */

import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';

/** Default storage quota: 100 MB */
export const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024;

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
  mkdir: (path: string) => Promise<void>;
  rmdir: (path: string) => Promise<void>;
  uploadFile: (dirPath: string, fileName: string, metadata: RevfsFileMetadata) => Promise<void>;
  downloadFile: (filePath: string) => Promise<string | undefined>;
  removeFile: (filePath: string) => Promise<void>;
  /** Rename a file or directory */
  rename: (path: string, newName: string) => Promise<void>;
  /** Move a file or directory to a new parent directory */
  move: (sourcePath: string, destParentPath: string) => Promise<void>;
  /** Copy a file or directory to a new parent directory */
  copy: (sourcePath: string, destParentPath: string) => Promise<void>;
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
  mkdir: (path: string) => Promise<void>;
  rmdir: (path: string) => Promise<void>;
  uploadFile: (dirPath: string, fileName: string, metadata: RevfsFileMetadata) => Promise<void>;
  downloadFile: (filePath: string) => Promise<string | undefined>;
  removeFile: (filePath: string) => Promise<void>;
  /** Rename a file or directory */
  rename: (path: string, newName: string) => Promise<void>;
  /** Move a file or directory to a new parent directory */
  move: (sourcePath: string, destParentPath: string) => Promise<void>;
  /** Copy a file or directory to a new parent directory */
  copy: (sourcePath: string, destParentPath: string) => Promise<void>;
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
