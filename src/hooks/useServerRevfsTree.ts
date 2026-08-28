/**
 * useServerRevfsTree Hook
 *
 * Provides reactive access to the server-scoped RE-VFS tree.
 * Server trees are private to the user and stored on the Citadel server.
 * No P2P sync - operations are local tree + server backend only.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [capabilitiesReceived, setCapabilitiesReceived] = useState(false);

  const key = myCid ? serverTreeKey(myCid) : null;

  // Calculate storage usage from tree (server-stored files)
  const storageUsed: number = useMemo(() => {
    if (!tree) return 0;
    return calculateStorageUsage(tree, TreeScope.Server);
  }, [tree]);

  // Query server capabilities on mount
  //
  // The guard used to be a ref set on first run — which survived the cleanup
  // that REMOVED the listener. The file manager flips myCid to null and back on
  // every Peer/Server toggle, so after one toggle-away the subscription was
  // gone and the ref short-circuited the re-subscribe: if the server's answer
  // landed in that window, the UI kept DEFAULT_SERVER_CAPABILITIES — permissive
  // quota, RE-VFS enabled — for the rest of the session, advertising storage
  // the server may refuse.
  //
  // The guard is now on whether real capabilities have been RECEIVED, which is
  // the thing it was meant to mean, and it does not outlive the listener.
  useEffect(() => {
    if (!myCid || capabilitiesReceived) return;

    const handleCapabilities = (data: ServerCapabilities) => {
      setCapabilitiesReceived(true);
      setServerCapabilities({
        allowServerFileTransfer: data.allowServerFileTransfer,
        allowServerRevfsStorage: data.allowServerRevfsStorage,
        maxFileTransferSizeMb: data.maxFileTransferSizeMb,
        revfsStorageQuotaMb: data.revfsStorageQuotaMb,
      });
    };

    // Listen for capabilities response
    eventEmitter.on('server:capabilities:loaded', handleCapabilities);

    workspaceService.getServerCapabilities().catch((err) => {
      debugLog('UseServerRevfsTree', 'Failed to query server capabilities:', err);
      // Keep default capabilities on error
    });

    return () => {
      eventEmitter.off('server:capabilities:loaded', handleCapabilities);
    };
  }, [myCid, capabilitiesReceived]);

  const loadTree = useCallback(async () => {
    if (!myCid) {
      setTree(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t: RevfsNode = await revfsService.getServerTree(myCid);
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

  const uploadFile = useCallback(async (dirPath: string, fileName: string, metadata: Parameters<typeof revfsService.uploadFileToServer>[3], content: Uint8Array) => {
    if (!myCid) return;
    await revfsService.uploadFileToServer(myCid, dirPath, fileName, metadata, content);
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
  const storageQuota: number = serverCapabilities.revfsStorageQuotaMb * 1024 * 1024;

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
