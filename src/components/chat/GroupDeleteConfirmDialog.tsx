/**
 * GroupDeleteConfirmDialog Component
 *
 * Confirmation dialog for deleting a group chat.
 * Extracted from GroupSettingsPanel to stay within file size limits.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface GroupDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function GroupDeleteConfirmDialog({
  open,
  onOpenChange,
  groupName,
  isDeleting,
  onConfirm,
}: GroupDeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#1C1D28] border-[#2D3548]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Delete &quot;{groupName}&quot;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            This action cannot be undone. All messages, members, and settings
            will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDeleting}
            className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? 'Deleting...' : 'Delete Group'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
