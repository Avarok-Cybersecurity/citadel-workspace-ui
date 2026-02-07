import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Paperclip, Upload, X, FileImage, FileText, FileVideo, FileAudio, File, Zap, Cloud, FolderOpen } from 'lucide-react';
import type { FileTransferMode } from '@/types/messaging-layer';
import { fileTransferService } from '@/lib/file-transfer';

interface FileTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendFile: (file: File, mode: FileTransferMode) => Promise<void>;
  onSendWithNativePicker?: (mode: FileTransferMode) => Promise<void>;
  peerCid: string; // Required for native picker flow
  maxFileSizeMb?: number;
}

export function FileTransferModal({
  isOpen,
  onClose,
  onSendFile,
  onSendWithNativePicker,
  peerCid,
  maxFileSizeMb = 100,
}: FileTransferModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Default to P2P mode since async mode (server upload) is not yet implemented
  const [transferMode, setTransferMode] = useState<FileTransferMode>('p2p');
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativePickerAvailable, setNativePickerAvailable] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <FileImage className="h-8 w-8 text-purple-400" />;
    if (mimeType.startsWith('video/')) return <FileVideo className="h-8 w-8 text-blue-400" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="h-8 w-8 text-green-400" />;
    if (mimeType.startsWith('text/') || mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-orange-400" />;
    return <File className="h-8 w-8 text-gray-400" />;
  };

  const handleFileSelect = useCallback((file: File) => {
    setError(null);

    if (file.size > maxFileSizeBytes) {
      setError(`File size (${formatBytes(file.size)}) exceeds maximum of ${formatBytes(maxFileSizeBytes)}`);
      return;
    }

    setSelectedFile(file);

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  }, [maxFileSizeBytes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  // Native file picker handler - uses internal-service's PickFile API
  const handleNativePickerClick = useCallback(async () => {
    setError(null);
    setIsPickingFile(true);

    try {
      // Call the native file picker via fileTransferService
      const transferId = await fileTransferService.sendFileWithNativePicker(
        peerCid,
        'Select a file to send',
        undefined // No extension filter for now
      );

      console.log('FileTransferModal: Native file transfer started', { transferId });

      // Close modal on success
      handleRemoveFile();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pick file';

      // Check if native picker is unavailable
      if (errorMessage.includes('native-dialogs feature is disabled') ||
          errorMessage.includes('File picker not available')) {
        setNativePickerAvailable(false);
        setError('Native file picker not available in this environment. Use drag & drop or browse instead.');
      } else if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        // User cancelled - not an error
        console.log('FileTransferModal: File picker cancelled');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsPickingFile(false);
    }
  }, [peerCid, onClose]);

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!selectedFile) return;

    setIsSending(true);
    setError(null);

    try {
      await onSendFile(selectedFile, transferMode);
      handleRemoveFile();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send file');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      handleRemoveFile();
      onClose();
    }
  };

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
          {/* Drop zone */}
          {!selectedFile && (
            <div className="space-y-3">
              {/* Native file picker button - primary option when available */}
              {nativePickerAvailable !== false && (
                <button
                  onClick={handleNativePickerClick}
                  disabled={isPickingFile || isSending}
                  className="w-full flex items-center gap-3 p-4 rounded-lg border border-[#6E59A5] bg-[#6E59A5]/10 hover:bg-[#6E59A5]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="p-2 rounded-lg bg-[#6E59A5]/20">
                    <FolderOpen className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="font-medium text-white">
                      {isPickingFile ? 'Opening file picker...' : 'Browse Files'}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Uses native file picker with full path access
                    </p>
                  </div>
                </button>
              )}

              {/* Divider */}
              {nativePickerAvailable !== false && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-[#3a3f5c]" />
                  <span className="text-xs text-gray-500">or</span>
                  <div className="flex-1 h-px bg-[#3a3f5c]" />
                </div>
              )}

              {/* Drag & drop zone - fallback option */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={handleBrowseClick}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-[#3a3f5c] hover:border-[#6E59A5] hover:bg-[#262C4A]'
                }`}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-300">
                  Drop file here or <span className="text-purple-400">browse</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Maximum file size: {formatBytes(maxFileSizeBytes)}
                </p>
              </div>
            </div>
          )}

          {/* File preview */}
          {selectedFile && (
            <div className="bg-[#262C4A] rounded-lg p-4">
              <div className="flex items-start gap-3">
                {/* Preview or icon */}
                <div className="flex-shrink-0">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={selectedFile.name}
                      className="h-16 w-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="h-16 w-16 flex items-center justify-center bg-[#1C1D28] rounded-lg">
                      {getFileIcon(selectedFile.type)}
                    </div>
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatBytes(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  onClick={handleRemoveFile}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  disabled={isSending}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleInputChange}
            className="hidden"
          />

          {/* Transfer mode selector */}
          <div className="space-y-2">
            <p className="text-sm text-gray-300 font-medium">Transfer Method</p>

            {/* Async (Server) option */}
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

            {/* P2P option */}
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

          {/* Error message */}
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
