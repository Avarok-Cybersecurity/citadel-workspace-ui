import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Paperclip, Upload, HardDrive } from 'lucide-react';
import { useFileTransfer } from './useFileTransfer';
import { FileDropZone } from './FileDropZone';

interface FileTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendFile: (file: File) => Promise<void>;
  peerCid: string;
  maxFileSizeMb?: number;
}

export function FileTransferModal({
  isOpen,
  onClose,
  onSendFile,
  peerCid,
  maxFileSizeMb = 100,
}: FileTransferModalProps): JSX.Element {
  const {
    selectedFile,
    previewUrl,
    isDragging,
    isSending,
    isPickingFile,
    error,
    nativePickerAvailable,
    fileInputRef,
    maxFileSizeBytes,
    formatBytes,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
    handleBrowseClick,
    handleNativePickerClick,
    handleRemoveFile,
    handleSend,
    storageRefusal,
    handleSendToStorage,
    handleClose,
  } = useFileTransfer({ onClose, onSendFile, peerCid, maxFileSizeMb });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-background border-surface text-foreground sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/20">
              <Paperclip className="h-5 w-5 text-primary-accent" />
            </div>
            <DialogTitle className="text-lg font-semibold">Send File</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            Sent over the Citadel protocol, encrypted end to end. Maximum size: {formatBytes(maxFileSizeBytes)}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <FileDropZone
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            isDragging={isDragging}
            isSending={isSending}
            isPickingFile={isPickingFile}
            nativePickerAvailable={nativePickerAvailable}
            maxFileSizeBytes={maxFileSizeBytes}
            formatBytes={formatBytes}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onBrowseClick={handleBrowseClick}
            onNativePickerClick={handleNativePickerClick}
            onRemoveFile={handleRemoveFile}
          />

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleInputChange}
            className="hidden"
          />

          {selectedFile && storageRefusal && (
            <p className="text-xs text-muted-foreground" data-testid="storage-refusal">{storageRefusal}</p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive-emphasis bg-destructive/10 p-2 rounded">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isSending}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSendToStorage}
            disabled={!selectedFile || isSending || storageRefusal !== null}
            title={storageRefusal ?? 'Puts it in the storage you share with them (File Manager). They open it by asking you, so you must be online then.'}
            data-testid="send-to-their-storage"
          >
            <span className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Send to their storage
            </span>
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedFile || isSending}
            className="text-foreground bg-primary"
          >
            {isSending ? 'Sending...' : (
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Send
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
