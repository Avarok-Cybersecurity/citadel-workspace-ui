/**
 * useServerRevfsTree Hook
 *
 * Provides reactive access to the server-scoped RE-VFS tree.
 * Server trees are private to the user and stored on the Citadel server.
 * No P2P sync - operations are local tree + server backend only.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { RevfsNode } from '@/types/revfs-types';
import { TreeScope } from '@/types/revfs-types';
import { revfsService } from '@/lib/revfs';
import { serverTreeKey, calculateStorageUsage } from '@/lib/revfs/tree-operations';
import { eventEmitter } from '@/lib/event-emitter';
import workspaceService from '@/lib/workspace-service';
import { debugLog } from '@/lib/debug-config';
import type { UseServerRevfsTreeResult, ServerCapabilities } from './useRevfsTree-types';
import { DEFAULT_SERVER_CAPABILITIES } from './useRevfsTree-types';

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

  const uploadFile = useCallback(async (dirPath: string, fileName: string, metadata: Parameters<typeof revfsService.uploadFileToServer>[3]) => {
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
