import { useCallback } from "react";
import { toast } from "sonner";
import type { RevfsNode, TreeKey, RevfsFileMetadata } from "@/types/revfs-types";
import { SENT_FILES_DIR, RevfsFileState, TreeScope } from "@/types/revfs-types";
import { revfsService } from "@/lib/revfs";
import { findNodeByPath } from "./useFileManagerContent";
import { useConfirm } from "@/components/shared/confirm-dialog";

interface HandlerDeps {
  mkdir: (path: string) => Promise<void>;
  rmdir: (path: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
  downloadFile: (path: string) => Promise<string | undefined>;
  uploadFile: (dir: string, name: string, metadata: RevfsFileMetadata) => Promise<void>;
  rename: (path: string, newName: string) => Promise<void>;
  move: (src: string, dest: string) => Promise<void>;
  copy: (src: string, dest: string) => Promise<void>;
  refresh: () => Promise<void>;
  cut: (items: RevfsNode[], treeKey: TreeKey) => void;
  copyToClipboard: (items: RevfsNode[], treeKey: TreeKey) => void;
  clearClipboard: () => void;
  clearSelection: () => void;
  selectItem: (path: string, mode: 'replace' | 'toggle' | 'range') => void;
  currentTreeKey: TreeKey | null;
  hasPasteItems: boolean;
  clipboard: { sourceTreeKey: TreeKey | null; items: RevfsNode[] };
  isCut: boolean;
  myCid: bigint | null;
  storageUsed: number;
  storageQuota: number;
  revfsEnabled: boolean;
  storageMode: TreeScope;
  selectedPeerCid: bigint | null;
  tree: RevfsNode | null;
  currentPath: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setUploadTargetDir: (dir: string) => void;
  setRevfsDisabledReason: (reason: 'peer_disabled' | 'server_disabled') => void;
  setRevfsDisabledModalOpen: (open: boolean) => void;
  setAttemptedFileSize: (size: number) => void;
  setStorageLimitModalOpen: (open: boolean) => void;
  setPropertiesNode: (node: RevfsNode | null) => void;
}

export function useFileManagerHandlers({
  mkdir, rmdir, removeFile, downloadFile, uploadFile, rename, move, copy, refresh,
  cut, copyToClipboard, clearClipboard, clearSelection, selectItem,
  currentTreeKey, hasPasteItems, clipboard, isCut,
  myCid, storageUsed, storageQuota, revfsEnabled, storageMode, selectedPeerCid,
  tree, currentPath, fileInputRef,
  setUploadTargetDir, setRevfsDisabledReason, setRevfsDisabledModalOpen,
  setAttemptedFileSize, setStorageLimitModalOpen, setPropertiesNode,
}: HandlerDeps) {
  const confirm = useConfirm();

  const handleNewFolder = useCallback((parentPath: string) => {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    const path = parentPath === '/' ? `/${name.trim()}` : `${parentPath}/${name.trim()}`;
    mkdir(path).catch(err => toast.error(`Failed to create folder: ${err}`));
  }, [mkdir]);

  const handleDelete = useCallback(async (node: RevfsNode) => {
    const isDirectory = node.type === 'directory';
    const ok = await confirm({
      title: isDirectory ? `Delete folder "${node.name}"?` : `Delete file "${node.name}"?`,
      description: isDirectory
        ? 'Everything inside it is deleted too. This cannot be undone.'
        : 'This cannot be undone.',
    });
    if (!ok) return;

    const removal = isDirectory ? rmdir(node.path) : removeFile(node.path);
    removal.catch(err => toast.error(`Failed to delete: ${err}`));
  }, [rmdir, removeFile, confirm]);

  const handleDownload = useCallback((node: RevfsNode) => {
    const isDownloadable = node.fileState === RevfsFileState.Remote
      || node.fileState === RevfsFileState.Received
      || node.fileState === RevfsFileState.ServerStored;

    if (isDownloadable) {
      downloadFile(node.path)
        .then(path => {
          if (path) toast.success(`Downloaded: ${node.name}`);
          else toast.info(`Download initiated for ${node.name}`);
        })
        .catch(err => toast.error(`Download failed: ${err}`));
    } else {
      toast.info(`${node.name} — ${node.fileState === RevfsFileState.Hosted ? 'Hosted for peer (encrypted, cannot open)' : 'Info only'}`);
    }
  }, [downloadFile]);

  const handleUploadFile = useCallback((dirPath: string) => {
    setUploadTargetDir(dirPath);
    fileInputRef.current?.click();
  }, [setUploadTargetDir, fileInputRef]);

  const handleInfo = useCallback((node: RevfsNode) => {
    setPropertiesNode(node);
  }, [setPropertiesNode]);

  const handleRename = useCallback(async (path: string, newName: string) => {
    try {
      await rename(path, newName);
      toast.success(`Renamed to "${newName}"`);
    } catch (err) {
      toast.error(`Failed to rename: ${err}`);
    }
  }, [rename]);

  const handleCut = useCallback((node: RevfsNode) => {
    if (!currentTreeKey) return;
    cut([node], currentTreeKey);
    toast.info(`Cut: ${node.name}`);
  }, [cut, currentTreeKey]);

  const handleCopy = useCallback((node: RevfsNode) => {
    if (!currentTreeKey) return;
    copyToClipboard([node], currentTreeKey);
    toast.info(`Copied: ${node.name}`);
  }, [copyToClipboard, currentTreeKey]);

  const handlePaste = useCallback(async (destPath: string) => {
    if (!hasPasteItems || !currentTreeKey) return;
    if (clipboard.sourceTreeKey !== currentTreeKey) {
      toast.error('Cannot paste between different storage trees');
      return;
    }
    try {
      for (const item of clipboard.items) {
        if (isCut) await move(item.path, destPath);
        else await copy(item.path, destPath);
      }
      toast.success(`Pasted ${clipboard.items.length} item(s)`);
      clearClipboard();
    } catch (err) {
      toast.error(`Failed to paste: ${err}`);
    }
  }, [hasPasteItems, currentTreeKey, clipboard, isCut, move, copy, clearClipboard]);

  const handleDeleteMultiple = useCallback(async (nodes: RevfsNode[]) => {
    const count = nodes.length;
    const ok = await confirm({
      title: `Delete ${count} item${count !== 1 ? 's' : ''}?`,
      description: 'Any folders in the selection are deleted with their contents. This cannot be undone.',
    });
    if (!ok) return;
    Promise.all(nodes.map(node => node.type === 'directory' ? rmdir(node.path) : removeFile(node.path)))
      .then(() => { toast.success(`Deleted ${count} item${count !== 1 ? 's' : ''}`); clearSelection(); })
      .catch(err => toast.error(`Failed to delete: ${err}`));
  }, [rmdir, removeFile, clearSelection, confirm]);

  const handleCutMultiple = useCallback((nodes: RevfsNode[]) => {
    if (!currentTreeKey) return;
    cut(nodes, currentTreeKey);
    toast.info(`Cut ${nodes.length} item${nodes.length !== 1 ? 's' : ''}`);
  }, [cut, currentTreeKey]);

  const handleCopyMultiple = useCallback((nodes: RevfsNode[]) => {
    if (!currentTreeKey) return;
    copyToClipboard(nodes, currentTreeKey);
    toast.info(`Copied ${nodes.length} item${nodes.length !== 1 ? 's' : ''}`);
  }, [copyToClipboard, currentTreeKey]);

  const handleSelectAll = useCallback(() => {
    if (!tree) return;
    const currentNode = tree.path === currentPath ? tree : findNodeByPath(tree, currentPath);
    if (!currentNode?.children) return;
    currentNode.children.forEach((n, i) => {
      selectItem(n.path, i === 0 ? 'replace' : 'toggle');
    });
  }, [tree, currentPath, selectItem]);

  const handleDrop = useCallback(async (targetPath: string, files: FileList) => {
    if (!myCid) { toast.error('Not connected'); return; }
    const isStandardTransfer = targetPath === SENT_FILES_DIR || targetPath.startsWith(SENT_FILES_DIR + '/');
    if (isStandardTransfer) { toast.info('Standard file transfer: Use P2P Chat to send files directly'); return; }
    if (!revfsEnabled) {
      setRevfsDisabledReason(storageMode === TreeScope.Server ? 'server_disabled' : 'peer_disabled');
      setRevfsDisabledModalOpen(true);
      return;
    }
    const fileArray = Array.from(files);
    const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > storageQuota - storageUsed) {
      setAttemptedFileSize(totalSize);
      setStorageLimitModalOpen(true);
      return;
    }
    for (const file of fileArray) {
      try {
        await uploadFile(targetPath, file.name, {
          fileId: crypto.randomUUID(), fileName: file.name, fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          virtualDirectory: targetPath, uploadedByCid: myCid,
        });
        toast.success(`Uploaded: ${file.name}`);
      } catch (err) { toast.error(`Failed to upload ${file.name}: ${err}`); }
    }
  }, [myCid, uploadFile, storageUsed, storageQuota, revfsEnabled, storageMode,
      setRevfsDisabledReason, setRevfsDisabledModalOpen, setAttemptedFileSize, setStorageLimitModalOpen]);

  const handleSync = useCallback(async () => {
    try {
      if (storageMode === TreeScope.Peer) {
        // Peer mode only auto-selects a peer when at least one is registered, so
        // "peer mode with no peer" is reachable and used to fall through to the
        // success toast below - telling the user their tree had synced with a
        // peer when no sync was requested of anyone.
        if (!myCid || !selectedPeerCid) {
          toast.error('No peer selected', {
            description: 'Choose a peer to sync with, or switch to server storage.',
          });
          return;
        }
        await revfsService.requestSync(myCid, selectedPeerCid);
        await refresh();
        toast.success('Tree synced with peer');
        return;
      }
      // Server mode: nothing is exchanged with a peer, so do not claim it was.
      await refresh();
      toast.success('Tree refreshed');
    } catch (err) { toast.error(`Sync failed: ${err}`); }
  }, [storageMode, myCid, selectedPeerCid, refresh]);

  return {
    handleNewFolder, handleDelete, handleDownload, handleUploadFile, handleInfo,
    handleRename, handleCut, handleCopy, handlePaste,
    handleDeleteMultiple, handleCutMultiple, handleCopyMultiple,
    handleSelectAll, handleDrop, handleSync,
  };
}
