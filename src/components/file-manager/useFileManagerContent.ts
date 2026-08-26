import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRevfsTree, useServerRevfsTree } from "@/hooks/useRevfsTree";
import { useVFSClipboard } from "@/hooks/useVFSClipboard";
import { useVFSSelection } from "@/hooks/useVFSSelection";
import { connectionManager } from "@/lib/connection";
import { p2pRegistrationService, type Peer } from "@/lib/p2p-registration-service";
import { peerPairKey, serverTreeKey } from "@/lib/revfs/tree-operations";
import type { RevfsNode, TreeKey } from "@/types/revfs-types";
import { TreeScope } from "@/types/revfs-types";
import { INTERVAL } from "@/lib/timeout-constants";
import { useFileManagerHandlers } from "./useFileManagerHandlers";

export function findNodeByPath(tree: RevfsNode, path: string): RevfsNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export function useFileManagerContent() {
  const [myCid, setMyCid] = useState<bigint | null>(null);
  const [registeredPeers, setRegisteredPeers] = useState<Peer[]>([]);
  const [selectedPeerCid, setSelectedPeerCid] = useState<bigint | null>(null);
  const [storageMode, setStorageMode] = useState<TreeScope>(TreeScope.Peer);

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

  useEffect(() => {
    if (storageMode === TreeScope.Peer && !selectedPeerCid && registeredPeers.length > 0) {
      const firstPeer = registeredPeers[0];
      if (firstPeer?.cid) setSelectedPeerCid(firstPeer.cid);
    }
  }, [storageMode, selectedPeerCid, registeredPeers]);

  const peerTree = useRevfsTree(
    storageMode === TreeScope.Peer ? myCid : null,
    storageMode === TreeScope.Peer ? selectedPeerCid : null
  );
  const serverTree = useServerRevfsTree(storageMode === TreeScope.Server ? myCid : null);
  const activeTree = storageMode === TreeScope.Server ? serverTree : peerTree;
  const { tree, loading, error, mkdir, rmdir, uploadFile, downloadFile, removeFile, rename, move, copy, refresh, storageUsed, storageQuota, revfsEnabled } = activeTree;

  const { clipboard, cut, copy: copyToClipboard, clear: clearClipboard, hasItems: hasPasteItems, isCut } = useVFSClipboard();
  const { selectedPaths, select: selectItem, clearSelection } = useVFSSelection();

  const currentTreeKey: TreeKey | null = useMemo(() => {
    if (storageMode === TreeScope.Server && myCid) return serverTreeKey(myCid);
    if (storageMode === TreeScope.Peer && myCid && selectedPeerCid) return peerPairKey(myCid, selectedPeerCid);
    return null;
  }, [storageMode, myCid, selectedPeerCid]);

  const cutItemPaths = useMemo(() => {
    if (!isCut || !currentTreeKey || clipboard.sourceTreeKey !== currentTreeKey) return new Set<string>();
    return new Set(clipboard.items.map(item => item.path));
  }, [isCut, currentTreeKey, clipboard.sourceTreeKey, clipboard.items]);

  const storageLabel = storageMode === TreeScope.Server
    ? 'Server'
    : registeredPeers.find(p => p.cid === selectedPeerCid)?.username ?? 'Peer';

  const [currentPath, setCurrentPath] = useState('/');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetDir, setUploadTargetDir] = useState('/');

  const [storageLimitModalOpen, setStorageLimitModalOpen] = useState(false);
  const [attemptedFileSize, setAttemptedFileSize] = useState(0);
  const [revfsDisabledModalOpen, setRevfsDisabledModalOpen] = useState(false);
  const [revfsDisabledReason, setRevfsDisabledReason] = useState<'peer_disabled' | 'server_disabled'>('peer_disabled');
  const [propertiesNode, setPropertiesNode] = useState<RevfsNode | null>(null);

  const [sortField, setSortField] = useState<'name' | 'date' | 'size' | 'type'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');

  // Drop the selection whenever the view changes underneath it.
  //
  // `selectedPaths` is a Set of absolute paths and nothing reconciled it with
  // what the grid shows: clearSelection had exactly two callers — after a
  // successful delete, and a click on the background. So navigating, filtering,
  // switching peer or switching storage mode all left a selection referring to
  // items that were no longer on screen, while the toolbar still read
  // "N selected".
  //
  // That is destructive, not cosmetic: the Delete shortcut resolves the
  // selection against the whole tree, so a user who selected 12 files, filtered
  // to 1, and pressed Delete deleted all 12 — including 11 they could not see.
  useEffect(() => {
    clearSelection();
  }, [currentPath, filterText, storageMode, selectedPeerCid, clearSelection]);

  const handleSortChange = useCallback((field: 'name' | 'date' | 'size' | 'type', direction: 'asc' | 'desc') => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

  const handlers = useFileManagerHandlers({
    mkdir, rmdir, removeFile, downloadFile, uploadFile, rename, move, copy, refresh,
    cut, copyToClipboard, clearClipboard, clearSelection, selectItem,
    currentTreeKey, hasPasteItems, clipboard, isCut,
    myCid, storageUsed, storageQuota, revfsEnabled, storageMode, selectedPeerCid,
    tree, currentPath, filterText, fileInputRef,
    setUploadTargetDir, setRevfsDisabledReason, setRevfsDisabledModalOpen,
    setAttemptedFileSize, setStorageLimitModalOpen, setPropertiesNode,
  });

  return {
    myCid, registeredPeers, selectedPeerCid, setSelectedPeerCid,
    storageMode, setStorageMode,
    tree, loading, error,
    storageUsed, storageQuota, storageLabel,
    currentPath, setCurrentPath,
    fileInputRef, uploadTargetDir,
    storageLimitModalOpen, setStorageLimitModalOpen, attemptedFileSize,
    revfsDisabledModalOpen, setRevfsDisabledModalOpen, revfsDisabledReason,
    propertiesNode, setPropertiesNode,
    sortField, sortDirection, filterText, setFilterText,
    handleSortChange,
    cutItemPaths, hasPasteItems, selectedPaths, selectItem, clearSelection,
    revfsEnabled,
    ...handlers,
  };
}
