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
}: VFSContextMenuProps) {
  const isProtected = node ? PROTECTED_DIRS.has(node.path) : false;
  const isDir = !node || node.type === 'directory';
  const isRoot = node?.path === '/';
  const fileState = node?.fileState;
  const canModify = node && !isProtected && !isRoot;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48 bg-[#343A5C] text-white border-purple-800">
        {/* Directory actions */}
        {isDir && (
          <>
            <ContextMenuItem onClick={onNewFolder} className="hover:bg-[#444A6C] cursor-pointer">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Folder
            </ContextMenuItem>
            <ContextMenuItem onClick={onUploadFile} className="hover:bg-[#444A6C] cursor-pointer">
              <FileUp className="mr-2 h-4 w-4" />
              Upload File
            </ContextMenuItem>
            {hasPasteItems && onPaste && (
              <ContextMenuItem onClick={onPaste} className="hover:bg-[#444A6C] cursor-pointer">
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Paste
              </ContextMenuItem>
            )}
            {canModify && (
              <>
                <ContextMenuSeparator className="bg-purple-800" />
                {onRename && (
                  <ContextMenuItem onClick={onRename} className="hover:bg-[#444A6C] cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                )}
                {onCut && (
                  <ContextMenuItem onClick={onCut} className="hover:bg-[#444A6C] cursor-pointer">
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut
                  </ContextMenuItem>
                )}
                {onCopy && (
                  <ContextMenuItem onClick={onCopy} className="hover:bg-[#444A6C] cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator className="bg-purple-800" />
                <ContextMenuItem onClick={onDelete} className="hover:bg-red-900/50 text-red-300 cursor-pointer">
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
              <ContextMenuItem onClick={onDownload} className="hover:bg-[#444A6C] cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                Download
              </ContextMenuItem>
            )}
            {fileState === RevfsFileState.Received && (
              <ContextMenuItem onClick={onDownload} className="hover:bg-[#444A6C] cursor-pointer">
                <FolderOpen className="mr-2 h-4 w-4" />
                Open
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={onInfo} className="hover:bg-[#444A6C] cursor-pointer">
              <Info className="mr-2 h-4 w-4" />
              Info
            </ContextMenuItem>
            {canModify && (
              <>
                <ContextMenuSeparator className="bg-purple-800" />
                {onRename && (
                  <ContextMenuItem onClick={onRename} className="hover:bg-[#444A6C] cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                )}
                {onCut && (
                  <ContextMenuItem onClick={onCut} className="hover:bg-[#444A6C] cursor-pointer">
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut
                  </ContextMenuItem>
                )}
                {onCopy && (
                  <ContextMenuItem onClick={onCopy} className="hover:bg-[#444A6C] cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </ContextMenuItem>
                )}
              </>
            )}
            {(fileState === RevfsFileState.Remote || fileState === RevfsFileState.Hosted) && (
              <>
                <ContextMenuSeparator className="bg-purple-800" />
                <ContextMenuItem onClick={onDelete} className="hover:bg-red-900/50 text-red-300 cursor-pointer">
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
