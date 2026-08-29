import { FileSpreadsheet, FileText, FileType, FileCode, Folder, FileX } from "lucide-react";
import { mayLeaveEditor } from '@/lib/leave-editor';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { formatBytes } from '@/lib/format-bytes';
import { peerDisplayName } from '@/lib/peer-display';
import { useRegisteredPeers } from '@/hooks';
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
import { formatDateTime } from '@/lib/format-time';

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
  /** Where the agent saved it, on the agent's filesystem. Not a URL. */
  savedTo: string;
}

/**
 * Format bytes to human readable size
 */


/**
 * Convert FileTransfer to FileDisplay for sidebar
 */
function mapTransferToDisplay(
  transfer: FileTransfer,
  usernameForCid: (cid: string) => string | undefined,
): FileDisplay {
  return {
    id: transfer.id,
    name: transfer.fileName,
    type: transfer.fileType || 'Unknown',
    size: transfer.fileSize,
    sender: {
      // A raw decimal CID, truncated, was shown as the sender's identity -- in
      // the one dialog whose job is to say who sent the file. peerDisplayName
      // is what every other surface uses; it falls back to a short handle
      // rather than thirteen digits.
      name: peerDisplayName({ cid: transfer.senderCid, username: usernameForCid(transfer.senderCid) }),
      avatar: '',
    },
    createdAt: formatDateTime(transfer.updatedAt),
    savedTo: transfer.downloadPath ?? '',
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
  const { registeredPeers } = useRegisteredPeers();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Load completed incoming transfers from FileTransferService
   */
  const loadFiles = useCallback((): void => {
    const downloads: FileTransfer[] = fileTransferService.getAllTransfers()
      .filter(t => t.state === 'complete' && t.isIncoming)
      .sort((a, b) => b.updatedAt - a.updatedAt); // Most recent first

    const usernameForCid = (cid: string) =>
      registeredPeers.find(peer => peer.cid.toString() === cid)?.username;

    setFiles(downloads.map(transfer => mapTransferToDisplay(transfer, usernameForCid)));
  }, [registeredPeers]);

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
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        loadFiles();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadFiles]);

  const handleFileClick = (file: FileDisplay): void => {
    setSelectedFile(file);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = (): void => {
    setIsPreviewOpen(false);
    setSelectedFile(null);
  };

  const params = new URLSearchParams(location.search);
  const isFileManagerActive = params.get('section') === 'files';

  const handleFileManagerClick = async (): Promise<void> => {
    // Deletes nodeId from the URL, which unmounts the editor.
    if (!(await mayLeaveEditor(confirm))) return;

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
        <SidebarGroupLabel className="text-primary-accent font-semibold px-0 ml-3">FILES</SidebarGroupLabel>
        <SidebarGroupContent>
          <ScrollArea className="max-h-[30vh]">
            <SidebarMenu>
              {files.length === 0 ? (
                <SidebarMenuItem>
                  <div
                    className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2"
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
                      className="text-foreground hover:bg-primary-accent/15 hover:text-foreground transition-colors"
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
                  // See TreeNodeItem: white belongs on a primary fill, not on the page.
                  className={`text-foreground hover:bg-primary-accent/15 hover:text-foreground transition-colors ${
                    isFileManagerActive ? "bg-primary-accent/20 text-primary-accent" : ""
                  }`}
                  onClick={() => void handleFileManagerClick()}
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
