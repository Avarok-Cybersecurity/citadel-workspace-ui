import { toast } from "sonner";
import { eventEmitter } from "@/lib/event-emitter";
import { TreeScope } from "@/types/revfs-types";
import { useFileManagerContent } from "./useFileManagerContent";
import { ConnectingScreen, NoPeersScreen, LoadingScreen, ErrorScreen } from "./FileManagerStatusScreens";
import { FileManagerStorageBar } from "./FileManagerStorageBar";
import { VFSTreeView } from "./VFSTreeView";
import { VFSContentGrid } from "./VFSContentGrid";
import { VFSToolbar } from "./VFSToolbar";
import { VFSPathBar } from "./VFSPathBar";
import { StorageLimitModal } from "./StorageLimitModal";
import { RevfsDisabledModal } from "./RevfsDisabledModal";
import { VFSPropertiesDialog } from "./VFSPropertiesDialog";

export const FileManagerContent = () => {
  const fm = useFileManagerContent();

  // ── Early returns ──────────────────────────────────────────────────────

  if (!fm.myCid) {
    return <ConnectingScreen />;
  }

  if (fm.storageMode === TreeScope.Peer && (fm.registeredPeers.length === 0 || !fm.selectedPeerCid)) {
    return <NoPeersScreen onSwitchToServer={() => fm.setStorageMode(TreeScope.Server)} />;
  }

  if (fm.loading) {
    return <LoadingScreen />;
  }

  if (fm.error || !fm.tree) {
    return <ErrorScreen error={fm.error ?? null} />;
  }

  // ── Main VFS Browser ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#444A6C]">
      <FileManagerStorageBar
        storageMode={fm.storageMode}
        setStorageMode={fm.setStorageMode}
        registeredPeers={fm.registeredPeers}
        selectedPeerCid={fm.selectedPeerCid}
        setSelectedPeerCid={fm.setSelectedPeerCid}
      />

      <VFSPathBar
        currentPath={fm.currentPath}
        onNavigate={fm.setCurrentPath}
        tree={fm.tree}
      />

      <VFSToolbar
        currentPath={fm.currentPath}
        onNavigate={fm.setCurrentPath}
        onNewFolder={() => fm.handleNewFolder(fm.currentPath)}
        onUploadFile={() => fm.handleUploadFile(fm.currentPath)}
        onSync={fm.handleSync}
        filterText={fm.filterText}
        onFilterChange={fm.setFilterText}
        sortField={fm.sortField}
        sortDirection={fm.sortDirection}
        onSortChange={fm.handleSortChange}
        selectionCount={fm.selectedPaths.size}
      />

      <div className="flex flex-1 overflow-hidden">
        <VFSTreeView
          tree={fm.tree}
          currentPath={fm.currentPath}
          onNavigate={fm.setCurrentPath}
          onNewFolder={fm.handleNewFolder}
          onDelete={fm.handleDelete}
          onUploadFile={fm.handleUploadFile}
          onDrop={fm.handleDrop}
          storageUsed={fm.storageUsed}
          storageQuota={fm.storageQuota}
          storageLabel={fm.storageLabel}
        />
        <VFSContentGrid
          tree={fm.tree}
          currentPath={fm.currentPath}
          onNavigate={fm.setCurrentPath}
          onNewFolder={fm.handleNewFolder}
          onDelete={fm.handleDelete}
          onDeleteMultiple={fm.handleDeleteMultiple}
          onDownload={fm.handleDownload}
          onUploadFile={fm.handleUploadFile}
          onInfo={fm.handleInfo}
          onRename={fm.handleRename}
          onCut={fm.handleCut}
          onCutMultiple={fm.handleCutMultiple}
          onCopy={fm.handleCopy}
          onCopyMultiple={fm.handleCopyMultiple}
          onPaste={fm.handlePaste}
          onDrop={fm.handleDrop}
          cutItemPaths={fm.cutItemPaths}
          hasPasteItems={fm.hasPasteItems}
          selectedPaths={fm.selectedPaths}
          onSelect={fm.selectItem}
          onSelectAll={fm.handleSelectAll}
          onClearSelection={fm.clearSelection}
          sortField={fm.sortField}
          sortDirection={fm.sortDirection}
          filterText={fm.filterText}
        />
      </div>

      {/* Hidden file input for uploads */}
      <input
        ref={fm.fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files?.length) {
            void fm.handleDrop(fm.uploadTargetDir, e.target.files);
            e.target.value = '';
          }
        }}
      />

      <StorageLimitModal
        isOpen={fm.storageLimitModalOpen}
        onClose={() => fm.setStorageLimitModalOpen(false)}
        usedBytes={fm.storageUsed}
        quotaBytes={fm.storageQuota}
        attemptedFileSize={fm.attemptedFileSize}
        onManageStorage={() => fm.setCurrentPath('/')}
      />

      <RevfsDisabledModal
        isOpen={fm.revfsDisabledModalOpen}
        onClose={() => fm.setRevfsDisabledModalOpen(false)}
        reason={fm.revfsDisabledReason}
        onOpenSettings={() => {
          // Emit event to open the P2P chat settings for the current peer
          if (fm.selectedPeerCid) {
            eventEmitter.emit('p2p:open-chat-settings', {
              peerCid: fm.selectedPeerCid,
            });
          }
          fm.setRevfsDisabledModalOpen(false);
        }}
      />

      <VFSPropertiesDialog
        node={fm.propertiesNode}
        isOpen={fm.propertiesNode !== null}
        onClose={() => fm.setPropertiesNode(null)}
      />
    </div>
  );
};
