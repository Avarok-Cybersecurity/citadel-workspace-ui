import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { VFS_SHORTCUTS, shortcutLabel, ariaShortcut, isApplePlatform, type VfsShortcut } from "./vfs-shortcuts";
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
import { RevfsFileState, PROTECTED_DIRS , type RevfsNode } from "@/types/revfs-types";
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

const APPLE: boolean = typeof navigator !== 'undefined' && isApplePlatform(navigator);

/** The key beside an action, and the same for assistive tech. */
function keys(s: VfsShortcut): { 'aria-keyshortcuts': string } {
  return { 'aria-keyshortcuts': ariaShortcut(s, APPLE) };
}
function Hint({ s }: { s: VfsShortcut }): JSX.Element {
  return <ContextMenuShortcut>{shortcutLabel(s, APPLE)}</ContextMenuShortcut>;
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
              <ContextMenuItem onClick={onPaste} {...keys(VFS_SHORTCUTS.paste)} className="hover:bg-card cursor-pointer">
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Paste
                <Hint s={VFS_SHORTCUTS.paste} />
              </ContextMenuItem>
            )}
            {canModify && (
              <>
                <ContextMenuSeparator className="bg-border" />
                {onRename && (
                  <ContextMenuItem onClick={onRename} {...keys(VFS_SHORTCUTS.rename)} className="hover:bg-card cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                    <Hint s={VFS_SHORTCUTS.rename} />
                  </ContextMenuItem>
                )}
                {onCut && (
                  <ContextMenuItem onClick={onCut} {...keys(VFS_SHORTCUTS.cut)} className="hover:bg-card cursor-pointer">
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut
                    <Hint s={VFS_SHORTCUTS.cut} />
                  </ContextMenuItem>
                )}
                {onCopy && (
                  <ContextMenuItem onClick={onCopy} {...keys(VFS_SHORTCUTS.copy)} className="hover:bg-card cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                    <Hint s={VFS_SHORTCUTS.copy} />
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator className="bg-border" />
                <ContextMenuItem onClick={onDelete} data-testid="vfs-delete" {...keys(VFS_SHORTCUTS.remove)} className="hover:bg-destructive/25 text-destructive cursor-pointer">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Folder
                  <Hint s={VFS_SHORTCUTS.remove} />
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
                  <ContextMenuItem onClick={onRename} {...keys(VFS_SHORTCUTS.rename)} className="hover:bg-card cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                    <Hint s={VFS_SHORTCUTS.rename} />
                  </ContextMenuItem>
                )}
                {onCut && (
                  <ContextMenuItem onClick={onCut} {...keys(VFS_SHORTCUTS.cut)} className="hover:bg-card cursor-pointer">
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut
                    <Hint s={VFS_SHORTCUTS.cut} />
                  </ContextMenuItem>
                )}
                {onCopy && (
                  <ContextMenuItem onClick={onCopy} {...keys(VFS_SHORTCUTS.copy)} className="hover:bg-card cursor-pointer">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                    <Hint s={VFS_SHORTCUTS.copy} />
                  </ContextMenuItem>
                )}
              </>
            )}
            {(fileState === RevfsFileState.Remote || fileState === RevfsFileState.Hosted) && (
              <>
                <ContextMenuSeparator className="bg-border" />
                <ContextMenuItem onClick={onDelete} data-testid="vfs-delete" {...keys(VFS_SHORTCUTS.remove)} className="hover:bg-destructive/25 text-destructive cursor-pointer">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                  <Hint s={VFS_SHORTCUTS.remove} />
                </ContextMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
