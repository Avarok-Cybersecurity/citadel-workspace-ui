/**
 * KickConfirmDialog sub-component for GroupMemberManagement.
 * Confirmation dialog for kicking a member from a group.
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
import type { GroupMemberWithRole } from '@/types/group';

interface KickConfirmDialogProps {
  member: GroupMemberWithRole | null;
  isKicking: boolean;
  onOpenChange: () => void;
  onConfirm: () => void;
}

export function KickConfirmDialog({
  member,
  isKicking,
  onOpenChange,
  onConfirm,
}: KickConfirmDialogProps) {
  return (
    <AlertDialog open={!!member} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#1C2333] border-[#2D3548]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Kick "{member?.username}"?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            This member will be removed from the group. They can be re-invited
            later by a group admin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isKicking}
            className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isKicking}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isKicking ? 'Kicking...' : 'Kick Member'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
