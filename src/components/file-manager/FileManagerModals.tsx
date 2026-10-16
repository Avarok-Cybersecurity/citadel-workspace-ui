/**
 * The file manager's dialogs and its hidden file picker.
 */
import { toast } from 'sonner';
import { StorageLimitModal } from './StorageLimitModal';
import { RevfsDisabledModal } from './RevfsDisabledModal';
import { MoveToDialog } from './MoveToDialog';
import { ShareDialog } from './ShareDialog';
import { FilePreviewDialog } from '@/components/layout/sidebar/FilePreviewDialog';
import { TreeScope } from '@/types/revfs-types';
import type { UseFileManagerContentResult } from './useFileManagerContent';
import type { FileManagerView } from './useFileManagerView';

export function FileManagerModals({ fm, v }: { fm: UseFileManagerContentResult; v: FileManagerView }): JSX.Element {
  return (
    <>
      <input
        ref={fm.fileInputRef}
        type="file"
        className="hidden"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) {
            void fm.handleDrop(fm.takeUploadTarget(), e.target.files);
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
        onManageStorage={() => fm.place.openFolder('/')}
      />

      <RevfsDisabledModal
        isOpen={fm.revfsDisabledModalOpen}
        onClose={() => fm.setRevfsDisabledModalOpen(false)}
        reason={fm.revfsDisabledReason}
        onOpenSettings={() => {
          // The dedicated P2P chat-settings UI doesn't exist yet, so the
          // button visibly tells the user what to do via a toast.
          toast.info('Open Chat Settings to configure P2P storage');
          fm.setRevfsDisabledModalOpen(false);
        }}
      />

      {fm.tree && <MoveToDialog tree={fm.tree} nodes={v.moving} onMove={(nodes, to) => { void fm.handleMove(nodes, to); }} onClose={v.closeMove} />}
      <ShareDialog links={v.sharing} peerName={fm.storageMode === TreeScope.Peer && fm.peerRegistered ? fm.storageLabel : null} onClose={v.closeShare} />

      <FilePreviewDialog
        file={fm.shownFile}
        isOpen={fm.shownFile !== null}
        onClose={() => fm.setShownFile(null)}
      />
    </>
  );
}
