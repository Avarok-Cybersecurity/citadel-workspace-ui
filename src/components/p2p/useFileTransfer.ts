import { useState, useRef, useCallback } from 'react';
import type { FileTransferMode } from '@/types/messaging-layer';
import { fileTransferService } from '@/lib/file-transfer';
import { MAX_BYTE_CONTENTS_SIZE_BYTES } from '@/lib/file-transfer/send-operations';
import { debugLog } from '@/lib/debug-config';

interface UseFileTransferOptions {
  onClose: () => void;
  onSendFile: (file: File, mode: FileTransferMode) => Promise<void>;
  peerCid: string;
  maxFileSizeMb: number;
}

export function useFileTransfer({
  onClose,
  onSendFile,
  peerCid,
  maxFileSizeMb,
}: UseFileTransferOptions) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState<FileTransferMode>('p2p');
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativePickerAvailable, setNativePickerAvailable] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The drag/browse path sends the selected File inline as `ByteContents`,
  // which `executeSendFile` hard-caps at MAX_BYTE_CONTENTS_SIZE_BYTES (2 MiB)
  // regardless of the configured `maxFileSizeMb`. Cap the selection at the
  // lower of the two so the user is told at selection time instead of hitting
  // a late send failure; larger files must go through the native file picker.
  const maxFileSizeBytes = Math.min(
    maxFileSizeMb * 1024 * 1024,
    MAX_BYTE_CONTENTS_SIZE_BYTES
  );

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = useCallback((file: File) => {
    setError(null);

    if (file.size > maxFileSizeBytes) {
      setError(
        `File size (${formatBytes(file.size)}) exceeds the ${formatBytes(maxFileSizeBytes)} ` +
        `inline limit. Use the native file picker for larger files.`
      );
      return;
    }

    setSelectedFile(file);

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

  const handleNativePickerClick = useCallback(async () => {
    setError(null);
    setIsPickingFile(true);

    try {
      const transferId = await fileTransferService.sendFileWithNativePicker(
        peerCid,
        'Select a file to send',
        undefined
      );

      debugLog('FileTransferModal', 'Native file transfer started', { transferId });
      handleRemoveFile();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pick file';

      if (errorMessage.includes('native-dialogs feature is disabled') ||
          errorMessage.includes('File picker not available')) {
        setNativePickerAvailable(false);
        setError('Native file picker not available in this environment. Use drag & drop or browse instead.');
      } else if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        debugLog('FileTransferModal', 'File picker cancelled');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsPickingFile(false);
    }
  }, [peerCid, onClose]);

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

  return {
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
  };
}
