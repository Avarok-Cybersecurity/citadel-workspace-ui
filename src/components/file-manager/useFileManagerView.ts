/**
 * The view's own state -- list or grid, the transfers panel, the Move and Share
 * dialogs -- and the one actions bundle every part of the view acts through.
 * None of it is in the address: a link names a place, not how it is drawn.
 */
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { RevfsNode } from '@/types/revfs-types';
import { TreeScope } from '@/types/revfs-types';
import { parentPath } from '@/lib/revfs/tree-queries';
import { peerDisplayName } from '@/lib/peer-display';
import { useCopyToClipboard, type CopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { UseFileManagerContentResult } from './useFileManagerContent';
import type { VFSItemActions } from './vfs-item-actions';
import type { ContentView } from './VFSContentGrid';
import type { ShareLink } from './ShareDialog';
import type { StoragePeer } from './storage-peers';
import { selectionPanel, type SelectionPanel } from './selection-panel';
import { useTransfers, type Transfers } from './useTransfers';
import { docsOpenAction } from './docs-file-open';

export interface FileManagerView {
  view: ContentView;
  setView: (view: ContentView) => void;
  transfersOpen: boolean;
  setTransfersOpen: (open: boolean) => void;
  transfers: Transfers;
  moving: RevfsNode[] | null;
  closeMove: () => void;
  sharing: ShareLink[] | null;
  closeShare: () => void;
  actions: VFSItemActions;
  panel: SelectionPanel;
  /** Who a CID is, for From columns and transfer rows. */
  nameOf: (cid: bigint) => string;
}

export function useFileManagerView(fm: UseFileManagerContentResult): FileManagerView {
  const [view, setView] = useState<ContentView>('list');
  const [transfersOpen, setTransfersOpen] = useState(false);
  const [moving, setMoving] = useState<RevfsNode[] | null>(null);
  const [sharing, setSharing] = useState<ShareLink[] | null>(null);
  const { copy }: CopyToClipboard = useCopyToClipboard();
  const { myCid, registeredPeers, place } = fm;

  const nameOf: (cid: bigint) => string = useCallback((cid: bigint): string => {
    if (cid === myCid) return 'You';
    const peer: StoragePeer | undefined = registeredPeers.find((p: StoragePeer): boolean => p.cid === cid);
    return peer?.displayName ?? peerDisplayName({ cid });
  }, [myCid, registeredPeers]);
  const transfers: Transfers = useTransfers(useCallback((cid: string): string => nameOf(BigInt(cid)), [nameOf]));

  const { linkTo, openFolder, openFile } = place;
  const openInDocs: VFSItemActions['openInDocs'] = useCallback((node: RevfsNode): void => openFile(node.path), [openFile]);
  const linkFor: (node: RevfsNode) => string | null = useCallback((node: RevfsNode): string | null =>
    node.type === 'directory' ? linkTo(node.path, null) : linkTo(parentPath(node.path), node.name), [linkTo]);

  const { handleDownload, handleInfo, handleDelete, handleDeleteMultiple, handleRename, handleCut, handleCutMultiple,
    handleCopy, handleCopyMultiple, handlePaste, handleNewFolder, handleUploadFile, handleSync, handleDrop } = fm;

  const actions: VFSItemActions = useMemo((): VFSItemActions => ({
    openFolder,
    openFile: (node: RevfsNode): void => (docsOpenAction({ openInDocs }, node) ?? ((): void => handleDownload(node)))(),
    openInDocs,
    inspect: handleInfo,
    download: handleDownload,
    share: (nodes: RevfsNode[]): void => {
      const links: ShareLink[] = nodes.flatMap((node: RevfsNode): ShareLink[] => {
        const url: string | null = linkFor(node);
        return url === null ? [] : [{ node, url }];
      });
      setSharing(links);
    },
    moveTo: setMoving,
    copyLink: (node: RevfsNode): void => {
      const url: string | null = linkFor(node);
      if (url === null) return;
      void copy(url).then((copied: boolean): void => { if (copied) toast.success('Link copied', { description: node.name }); });
    },
    remove: (nodes: RevfsNode[]): void => { void (nodes.length === 1 ? handleDelete(nodes[0]) : handleDeleteMultiple(nodes)); },
    rename: handleRename,
    cut: (nodes: RevfsNode[]): void => (nodes.length === 1 ? handleCut(nodes[0]) : handleCutMultiple(nodes)),
    copy: (nodes: RevfsNode[]): void => (nodes.length === 1 ? handleCopy(nodes[0]) : handleCopyMultiple(nodes)),
    paste: handlePaste,
    newFolder: (parent: string): void => { void handleNewFolder(parent); },
    upload: handleUploadFile,
    refresh: (): void => { void handleSync(); },
    drop: (target: string, files: FileList): void => { void handleDrop(target, files); },
  }), [openFolder, openInDocs, handleDownload, handleInfo, linkFor, copy, handleDelete, handleDeleteMultiple, handleRename,
    handleCut, handleCutMultiple, handleCopy, handleCopyMultiple, handlePaste, handleNewFolder, handleUploadFile, handleSync, handleDrop]);

  const panel: SelectionPanel = useMemo((): SelectionPanel => selectionPanel(fm.tree, fm.selectedPaths), [fm.tree, fm.selectedPaths]);

  return {
    view, setView, transfersOpen, setTransfersOpen, transfers,
    moving, closeMove: (): void => setMoving(null),
    sharing, closeShare: (): void => setSharing(null),
    actions, panel, nameOf,
  };
}

/** What Refresh does here, said on its button. */
export function refreshLabel(mode: TreeScope): string {
  return mode === TreeScope.Peer ? 'Sync with peer' : 'Refresh';
}
