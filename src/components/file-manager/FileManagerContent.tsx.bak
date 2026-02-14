import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useRevfsTree, useServerRevfsTree } from "@/hooks/useRevfsTree";
import { useVFSClipboard } from "@/hooks/useVFSClipboard";
import { useVFSSelection, type SelectMode } from "@/hooks/useVFSSelection";
import { connectionManager } from "@/lib/connection";
import { p2pRegistrationService, type Peer } from "@/lib/p2p-registration-service";
import { revfsService } from "@/lib/revfs";
import { peerPairKey, serverTreeKey } from "@/lib/revfs/tree-operations";
import type { RevfsNode, TreeKey } from "@/types/revfs-types";
import { SENT_FILES_DIR, RevfsFileState, TreeScope } from "@/types/revfs-types";
import { VFSTreeView } from "./VFSTreeView";
import { VFSContentGrid } from "./VFSContentGrid";
import { VFSToolbar } from "./VFSToolbar";
import { VFSPathBar } from "./VFSPathBar";
import { StorageLimitModal } from "./StorageLimitModal";
import { RevfsDisabledModal } from "./RevfsDisabledModal";
import { VFSPropertiesDialog } from "./VFSPropertiesDialog";
import { Loader2, Users, FolderOpen, Server, UserCircle2 } from "lucide-react";
import { INTERVAL } from "@/lib/timeout-constants";

function findNodeByPath(tree: RevfsNode, path: string): RevfsNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export const FileManagerContent = () => {
  const [myCid, setMyCid] = useState<bigint | null>(null);
  const [registeredPeers, setRegisteredPeers] = useState<Peer[]>([]);
  const [selectedPeerCid, setSelectedPeerCid] = useState<bigint | null>(null);
  const [storageMode, setStorageMode] = useState<TreeScope>(TreeScope.Peer);

  // Poll for CID and peers (connectionManager is async)
  useEffect(() => {
    const update = () => {
      const info = connectionManager.getConnectionInfo();
      setMyCid(info?.cid ?? null);
      const { registeredPeers: peers } = p2pRegistrationService.getPeers();
      setRegisteredPeers(peers);
    };

    update();
    const interval = setInterval(update, INTERVAL.HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, []);

  // Auto-select first peer if none selected (only in peer mode)
  useEffect(() => {
    if (storageMode === TreeScope.Peer && !selectedPeerCid && registeredPeers.length > 0) {
      const firstPeer = registeredPeers[0];
      if (firstPeer?.cid) {
        setSelectedPeerCid(firstPeer.cid);
      }
    }
  }, [storageMode, selectedPeerCid, registeredPeers]);

  // Use P2P tree or Server tree based on storage mode
  const peerTree = useRevfsTree(
    storageMode === TreeScope.Peer ? myCid : null,
    storageMode === TreeScope.Peer ? selectedPeerCid : null
  );
  const serverTree = useServerRevfsTree(
    storageMode === TreeScope.Server ? myCid : null
  );

  // Select active tree based on storage mode
  const activeTree = storageMode === TreeScope.Server ? serverTree : peerTree;
  const { tree, loading, error, mkdir, rmdir, uploadFile, downloadFile, removeFile, rename, move, copy, refresh, storageUsed, storageQuota, revfsEnabled } = activeTree;

  // Clipboard for cut/copy/paste
  const { clipboard, cut, copy: copyToClipboard, clear: clearClipboard, hasItems: hasPasteItems, isCut } = useVFSClipboard();

  // Multi-select state
  const { selectedPaths, select: selectItem, clearSelection, getSelectedNodes } = useVFSSelection();

  // Current tree key for clipboard operations
  const currentTreeKey: TreeKey | null = useMemo(() => {
    if (storageMode === TreeScope.Server && myCid) {
      return serverTreeKey(myCid);
    } else if (storageMode === TreeScope.Peer && myCid && selectedPeerCid) {
      return peerPairKey(myCid, selectedPeerCid);
    }
    return null;
  }, [storageMode, myCid, selectedPeerCid]);

  // Set of cut item paths for visual feedback
  const cutItemPaths = useMemo(() => {
    if (!isCut || !currentTreeKey || clipboard.sourceTreeKey !== currentTreeKey) {
      return new Set<string>();
    }
    return new Set(clipboard.items.map(item => item.path));
  }, [isCut, currentTreeKey, clipboard.sourceTreeKey, clipboard.items]);

  // Determine storage label based on mode
  const storageLabel = storageMode === TreeScope.Server
    ? 'Server'
    : registeredPeers.find(p => p.cid === selectedPeerCid)?.username ?? 'Peer';

  const [currentPath, setCurrentPath] = useState('/');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetDir, setUploadTargetDir] = useState('/');

  // Modal state
  const [storageLimitModalOpen, setStorageLimitModalOpen] = useState(false);
  const [attemptedFileSize, setAttemptedFileSize] = useState(0);
  const [revfsDisabledModalOpen, setRevfsDisabledModalOpen] = useState(false);
  const [revfsDisabledReason, setRevfsDisabledReason] = useState<'peer_disabled' | 'server_disabled'>('peer_disabled');
  const [propertiesNode, setPropertiesNode] = useState<RevfsNode | null>(null);

  // Sort and filter state
  const [sortField, setSortField] = useState<'name' | 'date' | 'size' | 'type'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');

  const handleSortChange = useCallback((field: 'name' | 'date' | 'size' | 'type', direction: 'asc' | 'desc') => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleNewFolder = useCallback((parentPath: string) => {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    const path = parentPath === '/' ? `/${name.trim()}` : `${parentPath}/${name.trim()}`;
    mkdir(path).catch(err => toast.error(`Failed to create folder: ${err}`));
  }, [mkdir]);

  const handleDelete = useCallback((node: RevfsNode) => {
    if (node.type === 'directory') {
      if (!confirm(`Delete folder "${node.name}" and all contents?`)) return;
      rmdir(node.path).catch(err => toast.error(`Failed to delete: ${err}`));
    } else {
      if (!confirm(`Delete file "${node.name}"?`)) return;
      removeFile(node.path).catch(err => toast.error(`Failed to delete: ${err}`));
    }
  }, [rmdir, removeFile]);

  const handleDownload = useCallback((node: RevfsNode) => {
    // Downloadable states: Remote (P2P), Received (P2P), ServerStored (Server)
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
  }, []);

  const handleInfo = useCallback((node: RevfsNode) => {
    setPropertiesNode(node);
  }, []);

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

    // Check if pasting into same tree
    if (clipboard.sourceTreeKey !== currentTreeKey) {
      toast.error('Cannot paste between different storage trees');
      return;
    }

    try {
      for (const item of clipboard.items) {
        if (isCut) {
          await move(item.path, destPath);
        } else {
          await copy(item.path, destPath);
        }
      }
      toast.success(`Pasted ${clipboard.items.length} item(s)`);
      clearClipboard();
    } catch (err) {
      toast.error(`Failed to paste: ${err}`);
    }
  }, [hasPasteItems, currentTreeKey, clipboard, isCut, move, copy, clearClipboard]);

  const handleDeleteMultiple = useCallback((nodes: RevfsNode[]) => {
    const count = nodes.length;
    if (!confirm(`Delete ${count} item${count !== 1 ? 's' : ''}?`)) return;

    Promise.all(nodes.map(node => {
      if (node.type === 'directory') {
        return rmdir(node.path);
      } else {
        return removeFile(node.path);
      }
    }))
      .then(() => {
        toast.success(`Deleted ${count} item${count !== 1 ? 's' : ''}`);
        clearSelection();
      })
      .catch(err => toast.error(`Failed to delete: ${err}`));
  }, [rmdir, removeFile, clearSelection]);

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
    const paths = currentNode.children.map(n => n.path);
    paths.forEach((path, i) => {
      selectItem(path, i === 0 ? 'replace' : 'toggle');
    });
  }, [tree, currentPath, selectItem]);

  const handleDrop = useCallback(async (targetPath: string, files: FileList) => {
    if (!myCid) {
      toast.error('Not connected');
      return;
    }

    const isStandardTransfer = targetPath === SENT_FILES_DIR || targetPath.startsWith(SENT_FILES_DIR + '/');
    if (isStandardTransfer) {
      toast.info('Standard file transfer: Use P2P Chat to send files directly');
      return;
    }

    // Check if RE-VFS is enabled
    if (!revfsEnabled) {
      setRevfsDisabledReason(storageMode === TreeScope.Server ? 'server_disabled' : 'peer_disabled');
      setRevfsDisabledModalOpen(true);
      return;
    }

    // Calculate total size of files to upload
    const fileArray = Array.from(files);
    const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0);

    // Check if upload would exceed quota
    const availableSpace = storageQuota - storageUsed;
    if (totalSize > availableSpace) {
      setAttemptedFileSize(totalSize);
      setStorageLimitModalOpen(true);
      return;
    }

    // Upload each file to RE-VFS
    for (const file of fileArray) {
      try {
        const fileId = crypto.randomUUID();
        const metadata = {
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          virtualDirectory: targetPath,
          uploadedByCid: myCid,
        };

        await uploadFile(targetPath, file.name, metadata);
        toast.success(`Uploaded: ${file.name}`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err}`);
      }
    }
  }, [myCid, uploadFile, storageUsed, storageQuota, revfsEnabled, storageMode]);

  const handleSync = useCallback(async () => {
    try {
      // Only request P2P sync in peer mode
      if (storageMode === TreeScope.Peer && myCid && selectedPeerCid) {
        await revfsService.requestSync(myCid, selectedPeerCid);
      }
      await refresh();
      toast.success('Tree synced');
    } catch (err) {
      toast.error(`Sync failed: ${err}`);
    }
  }, [storageMode, myCid, selectedPeerCid, refresh]);

  // ── No peers state ────────────────────────────────────────────────────

  if (!myCid) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#444A6C] text-gray-400 gap-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Connecting...</p>
      </div>
    );
  }

  // In peer mode without peers, show option to switch to server storage
  if (storageMode === TreeScope.Peer && (registeredPeers.length === 0 || !selectedPeerCid)) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#444A6C] text-gray-400 gap-4 p-8">
        <Users className="h-12 w-12" />
        <h2 className="text-xl text-white">No Peers Connected</h2>
        <p className="text-sm text-center max-w-md">
          Register a P2P peer to start using the shared file system,
          or use Server Storage for private encrypted files.
        </p>
        <button
          onClick={() => setStorageMode(TreeScope.Server)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded hover:bg-purple-600 transition-colors"
        >
          <Server className="h-4 w-4" />
          Use Server Storage
        </button>
      </div>
    );
  }

  // ── Loading / Error ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#444A6C] text-gray-400 gap-4">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Loading file system...</p>
      </div>
    );
  }

  if (error || !tree) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#444A6C] text-gray-400 gap-4 p-8">
        <FolderOpen className="h-12 w-12" />
        <h2 className="text-xl text-white">File System Error</h2>
        <p className="text-sm">{error ?? 'Failed to load tree'}</p>
      </div>
    );
  }

  // ── Main VFS Browser ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#444A6C]">
      {/* Storage mode & peer selector bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-purple-800 bg-[#2E3450]">
        {/* Storage mode tabs */}
        <div className="flex items-center gap-1 bg-[#1E2235] rounded p-1">
          <button
            onClick={() => setStorageMode(TreeScope.Peer)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
              storageMode === TreeScope.Peer
                ? 'bg-purple-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <UserCircle2 className="h-3.5 w-3.5" />
            P2P Storage
          </button>
          <button
            onClick={() => setStorageMode(TreeScope.Server)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
              storageMode === TreeScope.Server
                ? 'bg-purple-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            Server Storage
          </button>
        </div>

        {/* Peer selector (only in P2P mode with multiple peers) */}
        {storageMode === TreeScope.Peer && registeredPeers.length > 1 && (
          <>
            <div className="w-px h-6 bg-purple-800" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Peer:</span>
              {registeredPeers.map((peer) => (
                <button
                  key={peer.cid.toString()}
                  onClick={() => setSelectedPeerCid(peer.cid)}
                  className={`px-2 py-1 text-xs rounded ${
                    selectedPeerCid === peer.cid
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#444A6C] text-gray-300 hover:bg-[#555B8C]'
                  }`}
                >
                  {peer.username ?? peer.cid.toString().slice(0, 8)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Server storage indicator */}
        {storageMode === TreeScope.Server && (
          <>
            <div className="w-px h-6 bg-purple-800" />
            <span className="text-xs text-gray-400">
              Private encrypted storage on Citadel server
            </span>
          </>
        )}
      </div>

      {/* Editable path bar */}
      <VFSPathBar
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        tree={tree}
      />

      <VFSToolbar
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        onNewFolder={() => handleNewFolder(currentPath)}
        onUploadFile={() => handleUploadFile(currentPath)}
        onSync={handleSync}
        filterText={filterText}
        onFilterChange={setFilterText}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        selectionCount={selectedPaths.size}
      />

      <div className="flex flex-1 overflow-hidden">
        <VFSTreeView
          tree={tree}
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          onNewFolder={handleNewFolder}
          onDelete={handleDelete}
          onUploadFile={handleUploadFile}
          onDrop={handleDrop}
          storageUsed={storageUsed}
          storageQuota={storageQuota}
          storageLabel={storageLabel}
        />
        <VFSContentGrid
          tree={tree}
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          onNewFolder={handleNewFolder}
          onDelete={handleDelete}
          onDeleteMultiple={handleDeleteMultiple}
          onDownload={handleDownload}
          onUploadFile={handleUploadFile}
          onInfo={handleInfo}
          onRename={handleRename}
          onCut={handleCut}
          onCutMultiple={handleCutMultiple}
          onCopy={handleCopy}
          onCopyMultiple={handleCopyMultiple}
          onPaste={handlePaste}
          onDrop={handleDrop}
          cutItemPaths={cutItemPaths}
          hasPasteItems={hasPasteItems}
          selectedPaths={selectedPaths}
          onSelect={selectItem}
          onSelectAll={handleSelectAll}
          onClearSelection={clearSelection}
          sortField={sortField}
          sortDirection={sortDirection}
          filterText={filterText}
        />
      </div>

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleDrop(uploadTargetDir, e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Storage limit modal */}
      <StorageLimitModal
        isOpen={storageLimitModalOpen}
        onClose={() => setStorageLimitModalOpen(false)}
        usedBytes={storageUsed}
        quotaBytes={storageQuota}
        attemptedFileSize={attemptedFileSize}
        onManageStorage={() => {
          // Navigate to root to help user manage storage
          setCurrentPath('/');
        }}
      />

      {/* RE-VFS disabled modal */}
      <RevfsDisabledModal
        isOpen={revfsDisabledModalOpen}
        onClose={() => setRevfsDisabledModalOpen(false)}
        reason={revfsDisabledReason}
        onOpenSettings={() => {
          // @human-review Chat settings panel not yet implemented
          toast.info('Open Chat Settings to configure P2P storage');
        }}
      />

      {/* Properties dialog */}
      <VFSPropertiesDialog
        node={propertiesNode}
        isOpen={propertiesNode !== null}
        onClose={() => setPropertiesNode(null)}
      />
    </div>
  );
};
