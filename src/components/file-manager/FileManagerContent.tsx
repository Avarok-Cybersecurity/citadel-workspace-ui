
import { useState, useEffect, useCallback } from "react";
import { FilePreviewDialog } from "@/components/layout/sidebar/FilePreviewDialog";
import { toast } from "sonner";
import type { FileMetadata } from "@/types/files";
import { fileTransferService, FILE_TRANSFER_EVENTS, type FileTransfer } from "@/lib/file-transfer";
import { useEventListener } from "@/hooks";
import { FileManagerTabs } from "./FileManagerTabs";
import { DeleteDialog } from "./DeleteDialog";
import { ClearAllDialog } from "./ClearAllDialog";
import { VFSBrowser } from "./VFSBrowser";

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Convert FileTransfer to FileMetadata for file manager
 */
function mapTransferToFileMetadata(transfer: FileTransfer): FileMetadata {
  return {
    id: transfer.id,
    name: transfer.fileName,
    type: transfer.fileType || 'Unknown',
    size: transfer.fileSize,
    sender: {
      name: transfer.senderCid.slice(0, 12) + '...',
      avatar: '', // Default empty avatar for CID-based senders
    },
    createdAt: formatDate(transfer.updatedAt),
    url: transfer.downloadPath ?? '',
    transferType: 'standard' as const,
  };
}

const mockRevfsFiles: FileMetadata[] = [
  {
    id: "revfs-1",
    name: "Secure Document.pdf",
    type: "PDF Document",
    size: 1500000,
    sender: {
      name: "Alice Smith",
      avatar: "https://github.com/shadcn.png"
    },
    receiver: {
      name: "Bob Johnson",
      avatar: "https://github.com/shadcn.png"
    },
    createdAt: "2024-03-20T15:30:00Z",
    url: "/files/secure.pdf",
    transferType: "revfs" as const,
    status: "pending" as const,
    virtualPath: "/home/alice/documents/secure.pdf",
    isLocallyStored: true
  }
];

export const FileManagerContent = () => {
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [files, setFiles] = useState<FileMetadata[]>(mockRevfsFiles);

  /**
   * Load files from FileTransferService
   */
  const loadFiles = useCallback(() => {
    const downloads = fileTransferService.getAllTransfers()
      .filter(t => t.state === 'complete' && t.isIncoming)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(mapTransferToFileMetadata);

    // Combine downloaded files with REVFS mock files
    setFiles([...downloads, ...mockRevfsFiles]);
  }, []);

  // Initial load
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Subscribe to file transfer completion events
  useEventListener(FILE_TRANSFER_EVENTS.COMPLETED, loadFiles);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileMetadata | null>(null);
  const [dontAskDelete, setDontAskDelete] = useState(false);
  const [dontAskClearAll, setDontAskClearAll] = useState(false);
  const [clearAllType, setClearAllType] = useState<'standard' | 'revfs'>('standard');
  const [showVFSBrowser, setShowVFSBrowser] = useState(false);

  const handleFileClick = (file: FileMetadata) => {
    if (file.transferType === 'revfs') {
      setShowVFSBrowser(true);
    } else {
      setSelectedFile(file);
      setIsPreviewOpen(true);
    }
  };

  const handleDelete = (file: FileMetadata) => {
    if (dontAskDelete) {
      confirmDelete(file);
    } else {
      setFileToDelete(file);
      setShowDeleteDialog(true);
    }
  };

  const confirmDelete = (file: FileMetadata) => {
    setFiles(prev => prev.filter(f => f.id !== file.id));
    toast.success(`Deleted file: ${file.name}`);
  };

  const handleClearAll = (type: 'standard' | 'revfs') => {
    if (dontAskClearAll) {
      confirmClearAll(type);
    } else {
      setClearAllType(type);
      setShowClearAllDialog(true);
    }
  };

  const confirmClearAll = (type: 'standard' | 'revfs') => {
    setFiles(prev => prev.filter(f => f.transferType !== type));
    toast.success(`All ${type} files cleared`);
  };

  if (showVFSBrowser) {
    return (
      <div className="h-full bg-[#444A6C]">
        <VFSBrowser
          onBack={() => setShowVFSBrowser(false)}
          onFileSelect={(file) => {
            const matchingFile = mockRevfsFiles.find(f => f.virtualPath === file.path);
            if (matchingFile) {
              setSelectedFile(matchingFile);
              setIsPreviewOpen(true);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 bg-[#444A6C] min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">File Manager</h1>
        
        <FileManagerTabs
          files={files}
          onFileClick={handleFileClick}
          onDelete={handleDelete}
          onClearAll={handleClearAll}
        />
      </div>

      <FilePreviewDialog
        file={selectedFile}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedFile(null);
          setShowVFSBrowser(false);
        }}
      />

      <DeleteDialog
        showDialog={showDeleteDialog}
        setShowDialog={setShowDeleteDialog}
        fileToDelete={fileToDelete}
        dontAskDelete={dontAskDelete}
        setDontAskDelete={setDontAskDelete}
        onConfirmDelete={confirmDelete}
      />

      {!showVFSBrowser && (
        <ClearAllDialog
          showDialog={showClearAllDialog}
          setShowDialog={setShowClearAllDialog}
          clearAllType={clearAllType}
          dontAskClearAll={dontAskClearAll}
          setDontAskClearAll={setDontAskClearAll}
          onConfirmClearAll={confirmClearAll}
        />
      )}
    </div>
  );
};
