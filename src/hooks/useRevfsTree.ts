/**
 * useRevfsTree Hook
 *
 * Provides reactive access to the RE-VFS tree for a specific peer pair.
 * Wraps RevfsService with React state management.
 *
 * Two variants:
 * - useRevfsTree(myCid, peerCid): P2P shared tree between two peers
 * - useServerRevfsTree(myCid): Server-scoped tree for user's private server storage
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';
import { TreeScope } from '@/types/revfs-types';
import { revfsService } from '@/lib/revfs';
import { fileTransferService } from '@/lib/file-transfer';
import { peerPairKey, serverTreeKey, calculateStorageUsage } from '@/lib/revfs/tree-operations';
import { eventEmitter } from '@/lib/event-emitter';
import workspaceService from '@/lib/workspace-service';
import { debugLog } from '@/lib/debug-config';

/** Default storage quota: 100 MB */
const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024;

interface UseRevfsTreeResult {
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

export function useRevfsTree(myCid: bigint | null, peerCid: bigint | null): UseRevfsTreeResult {
  const [tree, setTree] = useState<RevfsNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = myCid && peerCid ? peerPairKey(myCid, peerCid) : null;

  // Calculate storage usage from tree (files I'm hosting for peer)
  const storageUsed = useMemo(() => {
    if (!tree) return 0;
    return calculateStorageUsage(tree, TreeScope.Peer);
  }, [tree]);

  // Check if RE-VFS is enabled for this peer (local settings)
  const { revfsEnabled, actualQuota } = useMemo(() => {
    if (!peerCid) return { revfsEnabled: false, actualQuota: DEFAULT_QUOTA_BYTES };
    const settings = fileTransferService.getSettings(peerCid.toString());
    return {
      revfsEnabled: settings.allowRevfsStorage,
      actualQuota: settings.revfsQuota,
    };
  }, [peerCid]);

  const loadTree = useCallback(async () => {
    if (!myCid || !peerCid) {
      setTree(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t = await revfsService.getTree(myCid, peerCid);
      setTree(t);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [myCid, peerCid]);

  // Load on mount and when CIDs change
  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // Subscribe to tree changes
  useEffect(() => {
    if (!key) return;
    const unsub = revfsService.onTreeChanged((changedKey, newTree) => {
      if (changedKey === key) {
        setTree(newTree);
      }
    });
    return unsub;
  }, [key]);

  const mkdir = useCallback(async (path: string) => {
    if (!myCid || !peerCid) return;
    await revfsService.mkdir(myCid, peerCid, path);
  }, [myCid, peerCid]);

  const rmdir = useCallback(async (path: string) => {
    if (!myCid || !peerCid) return;
    await revfsService.rmdir(myCid, peerCid, path);
  }, [myCid, peerCid]);

  const uploadFile = useCallback(async (dirPath: string, fileName: string, metadata: RevfsFileMetadata) => {
    if (!myCid || !peerCid) return;
    await revfsService.uploadFileToPeer(myCid, peerCid, dirPath, fileName, metadata);
  }, [myCid, peerCid]);

  const downloadFile = useCallback(async (filePath: string) => {
    if (!myCid || !peerCid) return undefined;
    return revfsService.downloadFileFromPeer(myCid, peerCid, filePath);
  }, [myCid, peerCid]);

  const removeFile = useCallback(async (filePath: string) => {
    if (!myCid || !peerCid) return;
    await revfsService.removeFileFromPeer(myCid, peerCid, filePath);
  }, [myCid, peerCid]);

  const rename = useCallback(async (path: string, newName: string) => {
    if (!myCid || !peerCid) return;
    await revfsService.rename(myCid, peerCid, path, newName);
  }, [myCid, peerCid]);

  const move = useCallback(async (sourcePath: string, destParentPath: string) => {
    if (!myCid || !peerCid) return;
    await revfsService.move(myCid, peerCid, sourcePath, destParentPath);
  }, [myCid, peerCid]);

  const copy = useCallback(async (sourcePath: string, destParentPath: string) => {
    if (!myCid || !peerCid) return;
    await revfsService.copy(myCid, peerCid, sourcePath, destParentPath);
  }, [myCid, peerCid]);

  return {
    tree,
    loading,
    error,
    storageUsed,
    storageQuota: actualQuota,
    revfsEnabled,
    mkdir,
    rmdir,
    uploadFile,
    downloadFile,
    removeFile,
    rename,
    move,
    copy,
    refresh: loadTree,
  };
}

// ============================================================================
// Server-Scoped Tree Hook
// ============================================================================

interface UseServerRevfsTreeResult {
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
interface ServerCapabilities {
  allowServerFileTransfer: boolean;
  allowServerRevfsStorage: boolean;
  maxFileTransferSizeMb: number;
  revfsStorageQuotaMb: number;
}

/** Default server capabilities (assume enabled until queried) */
const DEFAULT_SERVER_CAPABILITIES: ServerCapabilities = {
  allowServerFileTransfer: true,
  allowServerRevfsStorage: true,
  maxFileTransferSizeMb: 100,
  revfsStorageQuotaMb: 100,
};

/**
 * Hook for accessing the server-scoped RE-VFS tree.
 * Server trees are private to the user and stored on the Citadel server.
 * No P2P sync - operations are local tree + server backend only.
 */
export function useServerRevfsTree(myCid: bigint | null): UseServerRevfsTreeResult {
  const [tree, setTree] = useState<RevfsNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverCapabilities, setServerCapabilities] = useState<ServerCapabilities>(DEFAULT_SERVER_CAPABILITIES);
  const capabilitiesQueried = useRef(false);

  const key = myCid ? serverTreeKey(myCid) : null;

  // Calculate storage usage from tree (server-stored files)
  const storageUsed = useMemo(() => {
    if (!tree) return 0;
    return calculateStorageUsage(tree, TreeScope.Server);
  }, [tree]);

  // Query server capabilities on mount
  useEffect(() => {
    if (!myCid || capabilitiesQueried.current) return;

    const handleCapabilities = (data: ServerCapabilities) => {
      setServerCapabilities({
        allowServerFileTransfer: data.allowServerFileTransfer,
        allowServerRevfsStorage: data.allowServerRevfsStorage,
        maxFileTransferSizeMb: data.maxFileTransferSizeMb,
        revfsStorageQuotaMb: data.revfsStorageQuotaMb,
      });
    };

    // Listen for capabilities response
    eventEmitter.on('server:capabilities:loaded', handleCapabilities);

    // Query server capabilities
    capabilitiesQueried.current = true;
    workspaceService.getServerCapabilities().catch((err) => {
      debugLog('UseServerRevfsTree', 'Failed to query server capabilities:', err);
      // Keep default capabilities on error
    });

    return () => {
      eventEmitter.off('server:capabilities:loaded', handleCapabilities);
    };
  }, [myCid]);

  const loadTree = useCallback(async () => {
    if (!myCid) {
      setTree(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t = await revfsService.getServerTree(myCid);
      setTree(t);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [myCid]);

  // Load on mount and when CID changes
  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // Subscribe to tree changes
  useEffect(() => {
    if (!key) return;
    const unsub = revfsService.onTreeChanged((changedKey, newTree) => {
      if (changedKey === key) {
        setTree(newTree);
      }
    });
    return unsub;
  }, [key]);

  const mkdir = useCallback(async (path: string) => {
    if (!myCid) return;
    await revfsService.serverMkdir(myCid, path);
  }, [myCid]);

  const rmdir = useCallback(async (path: string) => {
    if (!myCid) return;
    await revfsService.serverRmdir(myCid, path);
  }, [myCid]);

  const uploadFile = useCallback(async (dirPath: string, fileName: string, metadata: RevfsFileMetadata) => {
    if (!myCid) return;
    await revfsService.uploadFileToServer(myCid, dirPath, fileName, metadata);
  }, [myCid]);

  const downloadFile = useCallback(async (filePath: string) => {
    if (!myCid) return undefined;
    return revfsService.downloadFileFromServer(myCid, filePath);
  }, [myCid]);

  const removeFile = useCallback(async (filePath: string) => {
    if (!myCid) return;
    await revfsService.removeFileFromServer(myCid, filePath);
  }, [myCid]);

  const rename = useCallback(async (path: string, newName: string) => {
    if (!myCid) return;
    await revfsService.serverRename(myCid, path, newName);
  }, [myCid]);

  const move = useCallback(async (sourcePath: string, destParentPath: string) => {
    if (!myCid) return;
    await revfsService.serverMove(myCid, sourcePath, destParentPath);
  }, [myCid]);

  const copy = useCallback(async (sourcePath: string, destParentPath: string) => {
    if (!myCid) return;
    await revfsService.serverCopy(myCid, sourcePath, destParentPath);
  }, [myCid]);

  // Convert MB quota to bytes
  const storageQuota = serverCapabilities.revfsStorageQuotaMb * 1024 * 1024;

  return {
    tree,
    loading,
    error,
    storageUsed,
    storageQuota,
    revfsEnabled: serverCapabilities.allowServerRevfsStorage,
    mkdir,
    rmdir,
    uploadFile,
    downloadFile,
    removeFile,
    rename,
    move,
    copy,
    refresh: loadTree,
  };
}
