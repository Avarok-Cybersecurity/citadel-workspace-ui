import { useState, useCallback, useRef, useEffect, useMemo, type RefObject, type Dispatch, type SetStateAction } from "react";
import { useRevfsTree, useServerRevfsTree } from "@/hooks/useRevfsTree";
import { useVFSClipboard } from "@/hooks/useVFSClipboard";
import { useVFSSelection  } from "@/hooks/useVFSSelection";
import { getCurrentCid } from "@/lib/p2p/current-cid";
import { useRegisteredPeers } from "@/hooks/use-registered-peers";
import { storagePeersFrom, type StoragePeer } from "./storage-peers";
import { peerPairKey, serverTreeKey } from "@/lib/revfs/tree-operations";
import type { RevfsNode, TreeKey } from "@/types/revfs-types";
import { TreeScope } from "@/types/revfs-types";
import { INTERVAL } from "@/lib/timeout-constants";
import { useFileManagerHandlers } from "./useFileManagerHandlers";
import { useUploadTarget, type UploadTarget } from './useUploadTarget';
import { revfsDownloadHistory } from '@/lib/revfs/download-history';
import type { FileDetails } from '@/components/layout/sidebar/file-details';
import type { UseRevfsTreeResult, UseServerRevfsTreeResult } from '@/hooks/useRevfsTree-types';

export { findNodeByPath } from '@/lib/revfs/tree-operations';

/**
 * Derived from the hooks it composes rather than restated: the handler block
 * and the three tree/clipboard/selection members would otherwise be a second
 * copy of shapes that already have one authority.
 */
export type UseFileManagerContentResult = ReturnType<typeof useFileManagerHandlers> & {
  myCid: bigint | null;
  registeredPeers: StoragePeer[];
  peersLoading: boolean;
  selectedPeerCid: bigint | null;
  setSelectedPeerCid: Dispatch<SetStateAction<bigint | null>>;
  storageMode: TreeScope;
  setStorageMode: Dispatch<SetStateAction<TreeScope>>;
  tree: UseServerRevfsTreeResult['tree'];
  loading: UseServerRevfsTreeResult['loading'];
  error: UseServerRevfsTreeResult['error'];
  refresh: UseServerRevfsTreeResult['refresh'];
  storageUsed: UseServerRevfsTreeResult['storageUsed'];
  storageQuota: UseServerRevfsTreeResult['storageQuota'];
  revfsEnabled: UseServerRevfsTreeResult['revfsEnabled'];
  storageLabel: string;
  currentPath: string;
  setCurrentPath: Dispatch<SetStateAction<string>>;
  fileInputRef: RefObject<HTMLInputElement>;
  /** The folder a picked file lands in; see useUploadTarget. */
  takeUploadTarget: UploadTarget['take'];
  storageLimitModalOpen: boolean;
  setStorageLimitModalOpen: Dispatch<SetStateAction<boolean>>;
  attemptedFileSize: number;
  revfsDisabledModalOpen: boolean;
  setRevfsDisabledModalOpen: Dispatch<SetStateAction<boolean>>;
  revfsDisabledReason: 'peer_disabled' | 'server_disabled';
  propertiesNode: RevfsNode | null;
  /** The file a "Show" asked for, in the FILES list's own dialog. */
  shownFile: FileDetails | null;
  setShownFile: Dispatch<SetStateAction<FileDetails | null>>;
  setPropertiesNode: Dispatch<SetStateAction<RevfsNode | null>>;
  sortField: 'name' | 'date' | 'size' | 'type';
  sortDirection: 'asc' | 'desc';
  filterText: string;
  setFilterText: Dispatch<SetStateAction<string>>;
  handleSortChange: (field: 'name' | 'date' | 'size' | 'type', direction: 'asc' | 'desc') => void;
  cutItemPaths: Set<string>;
  hasPasteItems: ReturnType<typeof useVFSClipboard>['hasItems'];
  selectedPaths: ReturnType<typeof useVFSSelection>['selectedPaths'];
  selectItem: ReturnType<typeof useVFSSelection>['select'];
  clearSelection: ReturnType<typeof useVFSSelection>['clearSelection'];
};

export function useFileManagerContent(): UseFileManagerContentResult {
  const [myCid, setMyCid] = useState<bigint | null>(null);
  const [selectedPeerCid, setSelectedPeerCid] = useState<bigint | null>(null);
  const [storageMode, setStorageMode] = useState<TreeScope>(TreeScope.Peer);
  // The list the sidebar shows, fetched from the agent. This read the
  // registration service's cache, which only a registration seen in THIS tab
  // fills, so a registered, online peer read as "No Peers Connected".
  const { registeredPeers: listed, isLoading: peersLoading } = useRegisteredPeers();
  const registeredPeers: StoragePeer[] = useMemo((): StoragePeer[] => storagePeersFrom(listed), [listed]);

  // The tab's own session, not the global connection: a tab that resumed its
  // session has no connection info for seconds, and that was "Connecting..."
  useEffect(() => {
    let live: boolean = true;
    const update = (): void => {
      getCurrentCid().then(
        (cid: bigint | null): void => { if (live) setMyCid(cid); },
        (): void => { if (live) setMyCid(null); },
      );
    };
    update();
    const interval: NodeJS.Timeout = setInterval(update, INTERVAL.HEARTBEAT_MS);
    return (): void => { live = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (storageMode === TreeScope.Peer && !selectedPeerCid && registeredPeers.length > 0) {
      const firstPeer: StoragePeer = registeredPeers[0];
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
    : listed.find(p => p.cid === selectedPeerCid?.toString())?.displayName ?? 'Peer';

  const [currentPath, setCurrentPath] = useState('/');
  const fileInputRef: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
  const uploadTarget: UploadTarget = useUploadTarget(currentPath);

  const [storageLimitModalOpen, setStorageLimitModalOpen] = useState(false);
  const [attemptedFileSize, setAttemptedFileSize] = useState(0);
  const [revfsDisabledModalOpen, setRevfsDisabledModalOpen] = useState(false);
  const [revfsDisabledReason, setRevfsDisabledReason] = useState<'peer_disabled' | 'server_disabled'>('peer_disabled');
  const [propertiesNode, setPropertiesNode] = useState<RevfsNode | null>(null);
  const [shownFile, setShownFile] = useState<FileDetails | null>(null);

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
    chooseUploadTarget: uploadTarget.choose, setRevfsDisabledReason, setRevfsDisabledModalOpen,
    setAttemptedFileSize, setStorageLimitModalOpen, setPropertiesNode,
    storageLabel, downloadHistory: revfsDownloadHistory, showFile: setShownFile,
  });

  return {
    myCid, registeredPeers, peersLoading, selectedPeerCid, setSelectedPeerCid,
    storageMode, setStorageMode,
    tree, loading, error,
    // Exposed so the error screen can offer a way out. It was already threaded
    // into the handlers; the screen that needs it had no route to it.
    refresh,
    storageUsed, storageQuota, storageLabel,
    currentPath, setCurrentPath,
    fileInputRef, takeUploadTarget: uploadTarget.take,
    storageLimitModalOpen, setStorageLimitModalOpen, attemptedFileSize,
    revfsDisabledModalOpen, setRevfsDisabledModalOpen, revfsDisabledReason,
    propertiesNode, setPropertiesNode, shownFile, setShownFile,
    sortField, sortDirection, filterText, setFilterText,
    handleSortChange,
    cutItemPaths, hasPasteItems, selectedPaths, selectItem, clearSelection,
    revfsEnabled,
    ...handlers,
  };
}
