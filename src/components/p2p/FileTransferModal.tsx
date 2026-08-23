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
      <DialogContent className="bg-[#1C1D28] border-[#262C4A] text-white sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#6E59A5]/20">
              <Paperclip className="h-5 w-5 text-purple-400" />
            </div>
            <DialogTitle className="text-lg font-semibold">Send File</DialogTitle>
          </div>
          <DialogDescription className="text-gray-400">
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
            <p className="text-sm text-gray-300 font-medium">Transfer Method</p>

            <button
              onClick={() => setTransferMode('async')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                transferMode === 'async'
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-[#3a3f5c] hover:border-[#6E59A5]'
              }`}
            >
              <div className={`p-2 rounded-lg ${transferMode === 'async' ? 'bg-purple-500/20' : 'bg-[#262C4A]'}`}>
                <Cloud className={`h-5 w-5 ${transferMode === 'async' ? 'text-purple-400' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${transferMode === 'async' ? 'text-white' : 'text-gray-300'}`}>
                    Send File
                  </span>
                  <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Stores on server, recipient downloads when ready
                </p>
              </div>
            </button>

            <button
              onClick={() => setTransferMode('p2p')}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                transferMode === 'p2p'
                  ? 'border-yellow-500 bg-yellow-500/10'
                  : 'border-[#3a3f5c] hover:border-[#6E59A5]'
              }`}
            >
              <div className={`p-2 rounded-lg ${transferMode === 'p2p' ? 'bg-yellow-500/20' : 'bg-[#262C4A]'}`}>
                <Zap className={`h-5 w-5 ${transferMode === 'p2p' ? 'text-yellow-400' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 text-left">
                <span className={`font-medium ${transferMode === 'p2p' ? 'text-white' : 'text-gray-300'}`}>
                  P2P Only Transfer
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Direct transfer, both must be online
                </p>
              </div>
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 p-2 rounded">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isSending}
            className="text-gray-400 hover:text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedFile || isSending}
            className={`text-white ${
              transferMode === 'p2p'
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-[#6E59A5] hover:bg-[#7c68d6]'
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
