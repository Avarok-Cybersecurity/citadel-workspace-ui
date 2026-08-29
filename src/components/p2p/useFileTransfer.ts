import { useState, useRef, useCallback, type RefObject, type DragEvent, type Dispatch, type SetStateAction } from 'react';
import { formatBytes } from '@/lib/format-bytes';
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

export interface UseFileTransferResult {
  selectedFile: File | null;
  previewUrl: string | null;
  transferMode: FileTransferMode;
  setTransferMode: Dispatch<SetStateAction<FileTransferMode>>;
  isDragging: boolean;
  isSending: boolean;
  isPickingFile: boolean;
  error: string | null;
  nativePickerAvailable: boolean | null;
  fileInputRef: RefObject<HTMLInputElement>;
  maxFileSizeBytes: number;
  formatBytes: (bytes: number) => string;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBrowseClick: () => void;
  handleNativePickerClick: () => Promise<void>;
  handleRemoveFile: () => void;
  handleSend: () => Promise<void>;
  handleClose: () => void;
}

export function useFileTransfer({
  onClose,
  onSendFile,
  peerCid,
  maxFileSizeMb,
}: UseFileTransferOptions): UseFileTransferResult {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState<FileTransferMode>('p2p');
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativePickerAvailable, setNativePickerAvailable] = useState<boolean | null>(null);
  const fileInputRef: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);

  // The drag/browse path sends the selected File inline as `ByteContents`,
  // which `executeSendFile` hard-caps at MAX_BYTE_CONTENTS_SIZE_BYTES (2 MiB)
  // regardless of the configured `maxFileSizeMb`. Cap the selection at the
  // lower of the two so the user is told at selection time instead of hitting
  // a late send failure; larger files must go through the native file picker.
  const maxFileSizeBytes: number = Math.min(
    maxFileSizeMb * 1024 * 1024,
    MAX_BYTE_CONTENTS_SIZE_BYTES
  );


  const handleRemoveFile = (): void => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect: (file: File) => void = useCallback((file: File): void => {
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
      const reader: FileReader = new FileReader();
      reader.onload = (e): void => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  }, [maxFileSizeBytes]);

  const handleDrop: (e: React.DragEvent) => void = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);

    const files: FileList = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver: (e: React.DragEvent) => void = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave: (e: React.DragEvent) => void = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files: FileList | null = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleBrowseClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleNativePickerClick: () => Promise<void> = useCallback(async (): Promise<void> => {
    setError(null);
    setIsPickingFile(true);

    try {
      const transferId: string = await fileTransferService.sendFileWithNativePicker(
        peerCid,
        'Select a file to send',
        undefined
      );

      debugLog('FileTransferModal', 'Native file transfer started', { transferId });
      handleRemoveFile();
      onClose();
    } catch (err) {
      const errorMessage: string = err instanceof Error ? err.message : 'Failed to pick file';

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

  const handleSend = async (): Promise<void> => {
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

  const handleClose = (): void => {
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
