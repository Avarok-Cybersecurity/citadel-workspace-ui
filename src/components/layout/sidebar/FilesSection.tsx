import { FileSpreadsheet, FileText, FileType, FileCode, Folder, FileX } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { FilePreviewDialog } from "./FilePreviewDialog";
import { useNavigate, useLocation } from "react-router-dom";
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { fileTransferService, FILE_TRANSFER_EVENTS, type FileTransfer } from "@/lib/file-transfer";
import { useEventListeners } from "@/hooks";

/**
 * File display type for sidebar rendering
 */
interface FileDisplay {
  id: string;
  name: string;
  type: string;
  size: number;
  sender: {
    name: string;
    avatar: string;
  };
  createdAt: string;
  url: string;
}

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
 * Convert FileTransfer to FileDisplay for sidebar
 */
function mapTransferToDisplay(transfer: FileTransfer): FileDisplay {
  return {
    id: transfer.id,
    name: transfer.fileName,
    type: transfer.fileType || 'Unknown',
    size: transfer.fileSize,
    sender: {
      name: transfer.senderCid.slice(0, 12) + '...', // Truncate CID for display
      avatar: '', // Default empty avatar for CID-based senders
    },
    createdAt: formatDate(transfer.updatedAt),
    url: transfer.downloadPath ?? '',
  };
}

const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="h-4 w-4" />;
    case 'pdf':
      return <FileType className="h-4 w-4" />;
    case 'md':
    case 'mdx':
    case 'txt':
    case 'doc':
    case 'docx':
    case 'odt':
      return <FileText className="h-4 w-4" />;
    default:
      return <FileCode className="h-4 w-4" />;
  }
};

export const FilesSection = () => {
  const [files, setFiles] = useState<FileDisplay[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileDisplay | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Load completed incoming transfers from FileTransferService
   */
  const loadFiles = useCallback(() => {
    const downloads = fileTransferService.getAllTransfers()
      .filter(t => t.state === 'complete' && t.isIncoming)
      .sort((a, b) => b.updatedAt - a.updatedAt); // Most recent first

    setFiles(downloads.map(mapTransferToDisplay));
  }, []);

  // Initial load
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Subscribe to file transfer completion and state change events
  useEventListeners(
    [FILE_TRANSFER_EVENTS.COMPLETED, FILE_TRANSFER_EVENTS.STATE_CHANGED],
    loadFiles
  );

  // Also refresh on window focus in case events were missed while tab was inactive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadFiles();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadFiles]);

  const handleFileClick = (file: FileDisplay) => {
    setSelectedFile(file);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setSelectedFile(null);
  };

  const params = new URLSearchParams(location.search);
  const isFileManagerActive = params.get('section') === 'files';

  const handleFileManagerClick = () => {
    const newParams = new URLSearchParams(location.search);
    newParams.set('section', 'files');
    newParams.delete('nodeId');
    newParams.delete('showP2P');
    newParams.delete('channel');
    newParams.delete('p2pUser');
    navigate(buildWorkspacePath(newParams));
  };

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem]" data-testid="files-section">
        <SidebarGroupLabel className="text-[#9b87f5] font-semibold px-0 ml-3">FILES</SidebarGroupLabel>
        <SidebarGroupContent>
          <ScrollArea className="max-h-[30vh]">
            <SidebarMenu>
              {files.length === 0 ? (
                <SidebarMenuItem>
                  <div
                    className="px-3 py-2 text-sm text-gray-400 flex items-center gap-2"
                    data-testid="no-files-message"
                  >
                    <FileX className="h-4 w-4" />
                    <span>No downloaded files yet</span>
                  </div>
                </SidebarMenuItem>
              ) : (
                files.map((file) => (
                  <SidebarMenuItem key={file.id} data-testid={`file-item-${file.id}`}>
                    <SidebarMenuButton
                      className="text-white hover:bg-purple-500/15 hover:text-white transition-colors"
                      onClick={() => handleFileClick(file)}
                    >
                      {getFileIcon(file.name)}
                      <span className="truncate" title={`${file.name} (${formatBytes(file.size)})`}>
                        {file.name}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isFileManagerActive}
                  className={`text-white hover:bg-purple-500/15 hover:text-white transition-colors ${
                    isFileManagerActive ? "bg-purple-500/20 text-purple-200" : ""
                  }`}
                  onClick={handleFileManagerClick}
                  data-testid="file-manager-button"
                >
                  <Folder className="h-4 w-4" />
                  <span>File Manager</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      <FilePreviewDialog
        file={selectedFile}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
    </>
  );
};
