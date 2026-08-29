/**
 * useRevfsTree Hook
 *
 * Provides reactive access to the RE-VFS tree for a specific peer pair.
 * Wraps RevfsService with React state management.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';
import { TreeScope } from '@/types/revfs-types';
import { revfsService } from '@/lib/revfs';
import { fileTransferService } from '@/lib/file-transfer';
import { peerPairKey, calculateStorageUsage } from '@/lib/revfs/tree-operations';
import { DEFAULT_QUOTA_BYTES , type UseRevfsTreeResult } from './useRevfsTree-types';
import type { FileTransferSettings } from '@/lib/file-transfer/types';

// Re-export the server hook for backward compatibility
export { useServerRevfsTree } from './useServerRevfsTree';

export function useRevfsTree(myCid: bigint | null, peerCid: bigint | null): UseRevfsTreeResult {
  const [tree, setTree] = useState<RevfsNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key: string | null = myCid && peerCid ? peerPairKey(myCid, peerCid) : null;

  const storageUsed: number = useMemo(() => {
    if (!tree) return 0;
    return calculateStorageUsage(tree, TreeScope.Peer);
  }, [tree]);

  const { revfsEnabled, actualQuota } = useMemo(() => {
    if (!peerCid) return { revfsEnabled: false, actualQuota: DEFAULT_QUOTA_BYTES };
    const settings: FileTransferSettings = fileTransferService.getSettings(peerCid.toString());
    return {
      revfsEnabled: settings.allowRevfsStorage,
      actualQuota: settings.revfsQuota,
    };
  }, [peerCid]);

  const loadTree: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (!myCid || !peerCid) {
      setTree(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t: RevfsNode = await revfsService.getTree(myCid, peerCid);
      setTree(t);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [myCid, peerCid]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!key) return;
    const unsub: () => void = revfsService.onTreeChanged((changedKey, newTree): void => {
      if (changedKey === key) {
        setTree(newTree);
      }
    });
    return unsub;
  }, [key]);

  const mkdir: (path: string) => Promise<void> = useCallback(async (path: string): Promise<void> => {
    if (!myCid || !peerCid) return;
    await revfsService.mkdir(myCid, peerCid, path);
  }, [myCid, peerCid]);

  const rmdir: (path: string) => Promise<void> = useCallback(async (path: string): Promise<void> => {
    if (!myCid || !peerCid) return;
    await revfsService.rmdir(myCid, peerCid, path);
  }, [myCid, peerCid]);

  const uploadFile: (dirPath: string, fileName: string, metadata: RevfsFileMetadata, content: Uint8Array) => Promise<void> = useCallback(async (dirPath: string, fileName: string, metadata: RevfsFileMetadata, content: Uint8Array): Promise<void> => {
    if (!myCid || !peerCid) return;
    await revfsService.uploadFileToPeer(myCid, peerCid, dirPath, fileName, metadata, content);
  }, [myCid, peerCid]);

  const downloadFile: (filePath: string) => Promise<string | undefined> = useCallback(async (filePath: string): Promise<string | undefined> => {
    if (!myCid || !peerCid) return undefined;
    return revfsService.downloadFileFromPeer(myCid, peerCid, filePath);
  }, [myCid, peerCid]);

  const removeFile: (filePath: string) => Promise<void> = useCallback(async (filePath: string): Promise<void> => {
    if (!myCid || !peerCid) return;
    await revfsService.removeFileFromPeer(myCid, peerCid, filePath);
  }, [myCid, peerCid]);

  const rename: (path: string, newName: string) => Promise<void> = useCallback(async (path: string, newName: string): Promise<void> => {
    if (!myCid || !peerCid) return;
    await revfsService.rename(myCid, peerCid, path, newName);
  }, [myCid, peerCid]);

  const move: (sourcePath: string, destParentPath: string) => Promise<void> = useCallback(async (sourcePath: string, destParentPath: string): Promise<void> => {
    if (!myCid || !peerCid) return;
    await revfsService.move(myCid, peerCid, sourcePath, destParentPath);
  }, [myCid, peerCid]);

  const copy: (sourcePath: string, destParentPath: string) => Promise<void> = useCallback(async (sourcePath: string, destParentPath: string): Promise<void> => {
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
