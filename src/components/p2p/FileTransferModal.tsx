import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Paperclip, Upload, Zap, Cloud } from 'lucide-react';
import type { FileTransferMode } from '@/types/messaging-layer';
import { useFileTransfer } from './useFileTransfer';
import { FileDropZone } from './FileDropZone';

interface FileTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendFile: (file: File, mode: FileTransferMode) => Promise<void>;
  onSendWithNativePicker?: (mode: FileTransferMode) => Promise<void>;
  peerCid: string;
  maxFileSizeMb?: number;
}

export function FileTransferModal({
  isOpen,
  onClose,
  onSendFile,
  onSendWithNativePicker: _onSendWithNativePicker,
  peerCid,
  maxFileSizeMb = 100,
}: FileTransferModalProps) {
  const {
    selectedFile,
    previewUrl,
    transferMode,
    setTransferMode,
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
            Choose a file to send to your peer. Maximum size: {formatBytes(maxFileSizeBytes)}
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

          {/* Transfer mode selector */}
          <div className="space-y-2">
            <p className="text-sm text-foreground/80 font-medium">Transfer Method</p>

            <button
              onClick={() => setTransferMode('async')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                transferMode === 'async'
                  ? 'border-primary-accent bg-primary-accent/10'
                  : 'border-surface hover:border-primary'
              }`}
            >
              <div className={`p-2 rounded-lg ${transferMode === 'async' ? 'bg-primary-accent/20' : 'bg-surface'}`}>
                <Cloud className={`h-5 w-5 ${transferMode === 'async' ? 'text-primary-accent' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${transferMode === 'async' ? 'text-foreground' : 'text-foreground/80'}`}>
                    Send File
                  </span>
                  <span className="text-xs text-success bg-success/10 px-1.5 py-0.5 rounded">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stores on server, recipient downloads when ready
                </p>
              </div>
            </button>

            <button
              onClick={() => setTransferMode('p2p')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                transferMode === 'p2p'
                  ? 'border-warning bg-warning/10'
                  : 'border-surface hover:border-primary'
              }`}
            >
              <div className={`p-2 rounded-lg ${transferMode === 'p2p' ? 'bg-warning/20' : 'bg-surface'}`}>
                <Zap className={`h-5 w-5 ${transferMode === 'p2p' ? 'text-warning' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 text-left">
                <span className={`font-medium ${transferMode === 'p2p' ? 'text-foreground' : 'text-foreground/80'}`}>
                  P2P Only Transfer
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Direct transfer, both must be online
                </p>
              </div>
            </button>
          </div>

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
            className="text-muted-foreground hover:text-foreground hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedFile || isSending}
            className={`text-foreground ${
              transferMode === 'p2p'
                ? 'bg-warning hover:bg-warning/90'
                : 'bg-primary'
            }`}
          >
            {isSending ? 'Sending...' : (
              <span className="flex items-center gap-2">
                {transferMode === 'p2p' ? <Zap className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                Send
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
