import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  FolderPlus,
  Trash2,
  Download,
  Info,
  FileUp,
  FolderOpen,
  Pencil,
  Scissors,
  Copy,
  ClipboardPaste,
} from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import { RevfsFileState, PROTECTED_DIRS } from "@/types/revfs-types";
import type { ReactNode } from "react";

interface VFSContextMenuProps {
  node: RevfsNode | null;
  children: ReactNode;
  onNewFolder: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onUploadFile: () => void;
  onInfo: () => void;
  onRename?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  hasPasteItems?: boolean;
}

export function VFSContextMenu({
  node,
  children,
  onNewFolder,
  onDelete,
  onDownload,
  onUploadFile,
  onInfo,
  onRename,
  onCut,
  onCopy,
  onPaste,
  hasPasteItems = false,
}: VFSContextMenuProps): JSX.Element {
  const isProtected: boolean = node ? PROTECTED_DIRS.has(node.path) : false;
  const isDir: boolean = !node || node.type === 'directory';
  const isRoot: boolean = node?.path === '/';
  const fileState: RevfsFileState | undefined = node?.fileState;
  const canModify: boolean | null = node && !isProtected && !isRoot;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48 bg-card text-foreground border-border">
        {/* Directory actions */}
        {isDir && (
          <>
            <ContextMenuItem onClick={onNewFolder} className="hover:bg-card cursor-pointer">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Folder
            </ContextMenuItem>
            <ContextMenuItem onClick={onUploadFile} className="hover:bg-card cursor-pointer">
              <FileUp className="mr-2 h-4 w-4" />
              Upload File
            </ContextMenuItem>
            {hasPasteItems && onPaste && (
              <ContextMenuItem onClick={onPaste} className="hover:bg-card cursor-pointer">
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Paste
              </ContextMenuItem>
            )}
            {canModify && (
              <>
                <ContextMenuSeparator className="bg-border" />
                {onRename && (
                  <ContextMenuItem onClick={onRename} className="hover:bg-card cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                )}
                {onCut && (
                  <ContextMenuItem onClick={onCut} className="hover:bg-card cursor-pointer">
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut
                  </ContextMenuItem>
                )}
                {onCopy && (
                  <ContextMenuItem onClick={onCopy} className="hover:bg-card cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator className="bg-border" />
                <ContextMenuItem onClick={onDelete} data-testid="vfs-delete" className="hover:bg-destructive/25 text-destructive cursor-pointer">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Folder
                </ContextMenuItem>
              </>
            )}
          </>
        )}

        {/* File actions by state */}
        {!isDir && (
          <>
            {fileState === RevfsFileState.Remote && (
              <ContextMenuItem onClick={onDownload} className="hover:bg-card cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                Download
              </ContextMenuItem>
            )}
            {fileState === RevfsFileState.Received && (
              <ContextMenuItem onClick={onDownload} className="hover:bg-card cursor-pointer">
                <FolderOpen className="mr-2 h-4 w-4" />
                Open
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={onInfo} className="hover:bg-card cursor-pointer">
              <Info className="mr-2 h-4 w-4" />
              Info
            </ContextMenuItem>
            {canModify && (
              <>
                <ContextMenuSeparator className="bg-border" />
                {onRename && (
                  <ContextMenuItem onClick={onRename} className="hover:bg-card cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                )}
                {onCut && (
                  <ContextMenuItem onClick={onCut} className="hover:bg-card cursor-pointer">
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut
                  </ContextMenuItem>
                )}
                {onCopy && (
                  <ContextMenuItem onClick={onCopy} className="hover:bg-card cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </ContextMenuItem>
                )}
              </>
            )}
            {(fileState === RevfsFileState.Remote || fileState === RevfsFileState.Hosted) && (
              <>
                <ContextMenuSeparator className="bg-border" />
                <ContextMenuItem onClick={onDelete} data-testid="vfs-delete" className="hover:bg-destructive/25 text-destructive cursor-pointer">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </ContextMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
