import { useState, useCallback, useRef, useEffect, useMemo , type RefObject } from "react";
import { useRevfsTree, useServerRevfsTree } from "@/hooks/useRevfsTree";
import { useVFSClipboard } from "@/hooks/useVFSClipboard";
import { useVFSSelection  } from "@/hooks/useVFSSelection";
import { connectionManager } from "@/lib/connection";
import { p2pRegistrationService, type Peer } from "@/lib/p2p-registration-service";
import { peerPairKey, serverTreeKey } from "@/lib/revfs/tree-operations";
import type { RevfsNode, TreeKey } from "@/types/revfs-types";
import { TreeScope } from "@/types/revfs-types";
import { INTERVAL } from "@/lib/timeout-constants";
import { useFileManagerHandlers } from "./useFileManagerHandlers";
import type { CurrentConnectionInfo } from '@/lib/connection/types';
import type { UseRevfsTreeResult, UseServerRevfsTreeResult } from '@/hooks/useRevfsTree-types';

export { findNodeByPath } from '@/lib/revfs/tree-operations';

export function useFileManagerContent() {
  const [myCid, setMyCid] = useState<bigint | null>(null);
  const [registeredPeers, setRegisteredPeers] = useState<Peer[]>([]);
  const [selectedPeerCid, setSelectedPeerCid] = useState<bigint | null>(null);
  const [storageMode, setStorageMode] = useState<TreeScope>(TreeScope.Peer);

  useEffect(() => {
    const update = (): void => {
      const info: CurrentConnectionInfo | null = connectionManager.getConnectionInfo();
      setMyCid(info?.cid ?? null);
      const { registeredPeers: peers } = p2pRegistrationService.getPeers();
      setRegisteredPeers(peers);
    };
    update();
    const interval: NodeJS.Timeout = setInterval(update, INTERVAL.HEARTBEAT_MS);
    return (): void => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (storageMode === TreeScope.Peer && !selectedPeerCid && registeredPeers.length > 0) {
      const firstPeer: Peer = registeredPeers[0];
      if (firstPeer?.cid) setSelectedPeerCid(firstPeer.cid);
    }
  }, [storageMode, selectedPeerCid, registeredPeers]);

  const peerTree: UseRevfsTreeResult = useRevfsTree(
    storageMode === TreeScope.Peer ? myCid : null,
    storageMode === TreeScope.Peer ? selectedPeerCid : null
  );
  const serverTree: UseServerRevfsTreeResult = useServerRevfsTree(storageMode === TreeScope.Server ? myCid : null);
  const activeTree: UseServerRevfsTreeResult = storageMode === TreeScope.Server ? serverTree : peerTree;
  const { tree, loading, error, mkdir, rmdir, uploadFile, downloadFile, removeFile, rename, move, copy, refresh, storageUsed, storageQuota, revfsEnabled } = activeTree;

  const { clipboard, cut, copy: copyToClipboard, clear: clearClipboard, hasItems: hasPasteItems, isCut } = useVFSClipboard();
  const { selectedPaths, select: selectItem, selectAll, clearSelection } = useVFSSelection();

  const currentTreeKey: TreeKey | null = useMemo(() => {
    if (storageMode === TreeScope.Server && myCid) return serverTreeKey(myCid);
    if (storageMode === TreeScope.Peer && myCid && selectedPeerCid) return peerPairKey(myCid, selectedPeerCid);
    return null;
  }, [storageMode, myCid, selectedPeerCid]);

  const cutItemPaths: Set<string> = useMemo(() => {
    if (!isCut || !currentTreeKey || clipboard.sourceTreeKey !== currentTreeKey) return new Set<string>();
    return new Set(clipboard.items.map(item => item.path));
  }, [isCut, currentTreeKey, clipboard.sourceTreeKey, clipboard.items]);

  const storageLabel: string = storageMode === TreeScope.Server
    ? 'Server'
    : registeredPeers.find(p => p.cid === selectedPeerCid)?.username ?? 'Peer';

  const [currentPath, setCurrentPath] = useState('/');
  const fileInputRef: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
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

  // And clear the FILTER itself on those same context changes — everything the
  // comment above says about a stale selection is true of a stale filter, minus
  // the "N selected" readout that made the selection visible.
  //
  // The filter matches only the current directory's immediate children, so it
  // travelled with the user into folders where it matched nothing — and the
  // grid then rendered "This folder is empty. Drag files here or right-click to
  // create a folder" about a folder with files in it. The box is 32px wide in
  // the top-right corner, so there is nothing on screen to explain it.
  //
  // `currentPath` is deliberately absent from the selection effect's siblings
  // here: the filter belongs to the view, and every one of these changes the
  // view.
  useEffect(() => {
    setFilterText('');
  }, [currentPath, storageMode, selectedPeerCid]);

  const handleSortChange: (field: "name" | "date" | "size" | "type", direction: "asc" | "desc") => void = useCallback((field: 'name' | 'date' | 'size' | 'type', direction: 'asc' | 'desc'): void => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

  const handlers: ReturnType<typeof useFileManagerHandlers> = useFileManagerHandlers({
    mkdir, rmdir, removeFile, downloadFile, uploadFile, rename, move, copy, refresh,
    cut, copyToClipboard, clearClipboard, clearSelection, selectAll,
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
    // Exposed so the error screen can offer a way out. It was already threaded
    // into the handlers; the screen that needs it had no route to it.
    refresh,
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
