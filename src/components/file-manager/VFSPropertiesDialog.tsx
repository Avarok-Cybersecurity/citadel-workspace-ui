/**
 * VFSPropertiesDialog Component
 *
 * Modal dialog showing detailed properties of a file or directory.
 */

import { formatBytes } from '@/lib/format-bytes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Folder,
  FileText,
  FileImage,
  FileCode,
  Monitor,
  Cloud,
  Upload,
  Download,
} from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import { RevfsFileState } from "@/types/revfs-types";
import type { RevfsFileMetadata } from '@/types/revfs-types';

interface VFSPropertiesDialogProps {
  node: RevfsNode | null;
  isOpen: boolean;
  onClose: () => void;
}

function getFileIcon(fileName: string) {
  const ext: string = fileName.split('.').pop()?.toLowerCase() ?? '';
  const imageExts: string[] = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
  const codeExts: string[] = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml'];
  if (imageExts.includes(ext)) return FileImage;
  if (codeExts.includes(ext)) return FileCode;
  return FileText;
}


function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function countItems(node: RevfsNode): { files: number; folders: number } {
  let files: number = 0;
  let folders: number = 0;

  function traverse(n: RevfsNode): void {
    for (const child of n.children ?? []) {
      if (child.type === 'directory') {
        folders++;
        traverse(child);
      } else {
        files++;
      }
    }
  }

  traverse(node);
  return { files, folders };
}

const stateLabels: Record<RevfsFileState, { label: string; icon: typeof Monitor }> = {
  [RevfsFileState.Hosted]: { label: 'Hosted (stored for peer)', icon: Monitor },
  [RevfsFileState.Remote]: { label: 'Remote (downloadable)', icon: Cloud },
  [RevfsFileState.Sent]: { label: 'Sent', icon: Upload },
  [RevfsFileState.Received]: { label: 'Received', icon: Download },
  [RevfsFileState.ServerStored]: { label: 'Server stored', icon: Cloud },
};

export function VFSPropertiesDialog({
  node,
  isOpen,
  onClose,
}: VFSPropertiesDialogProps): JSX.Element | null {
  if (!node) return null;

  const isDir: boolean = node.type === 'directory';
  const Icon = isDir ? Folder : getFileIcon(node.name);
  const meta: RevfsFileMetadata | undefined = node.fileMetadata;
  const state: { label: string; icon: typeof Monitor; } | null = node.fileState ? stateLabels[node.fileState] : null;
  const StateIcon = state?.icon;
  const itemCounts: { files: number; folders: number; } | null = isDir ? countItems(node) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Icon className={isDir ? "h-8 w-8 text-warning-emphasis" : "h-8 w-8 text-foreground/80"} />
            <span className="truncate">{node.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Type */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type:</span>
            <span>{isDir ? 'Folder' : (meta?.fileType || 'File')}</span>
          </div>

          {/* Path */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location:</span>
            <span className="truncate max-w-[250px]" title={node.path}>{node.path}</span>
          </div>

          {/* Size (for files) */}
          {meta && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size:</span>
              <span>{formatBytes(meta.fileSize)}</span>
            </div>
          )}

          {/* Item count (for directories) */}
          {itemCounts && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contains:</span>
              <span>
                {itemCounts.folders > 0 && `${itemCounts.folders} folder${itemCounts.folders !== 1 ? 's' : ''}`}
                {itemCounts.folders > 0 && itemCounts.files > 0 && ', '}
                {itemCounts.files > 0 && `${itemCounts.files} file${itemCounts.files !== 1 ? 's' : ''}`}
                {itemCounts.folders === 0 && itemCounts.files === 0 && 'Empty'}
              </span>
            </div>
          )}

          {/* State (for files with state) */}
          {state && StateIcon && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">State:</span>
              <span className="flex items-center gap-2">
                <StateIcon className="h-4 w-4" />
                {state.label}
              </span>
            </div>
          )}

          {/* Created */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created:</span>
            <span>{formatDate(node.createdAt)}</span>
          </div>

          {/* Modified */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Modified:</span>
            <span>{formatDate(node.updatedAt)}</span>
          </div>

          {/* File ID (for files) */}
          {meta?.fileId && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">File ID:</span>
              <span className="truncate max-w-[200px] text-xs text-muted-foreground" title={meta.fileId}>
                {meta.fileId}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
