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
import type { GroupRole } from '@/types/group';

/** Summarizes a role's enabled permissions into a short display string. */
export function formatPermissions(role: GroupRole): string {
  const perms = role.permissions;
  const enabled: string[] = [];

  if (perms.sendMessages) enabled.push('send');
  if (perms.viewMemberList) enabled.push('view');
  if (perms.inviteMembers) enabled.push('invite');
  if (perms.kickMembers) enabled.push('kick');
  if (perms.manageRoles) enabled.push('roles');
  if (perms.assignRoles) enabled.push('assign');
  if (perms.editGroupSettings) enabled.push('settings');
  if (perms.deleteGroup) enabled.push('delete');

  if (enabled.length === 8) return 'All permissions';
  if (enabled.length === 0) return 'No permissions';
  return `Can: ${enabled.join(', ')}`;
}

interface DeleteRoleDialogProps {
  roleToDelete: GroupRole | null;
  onOpenChange: () => void;
  onConfirm: () => void;
}

/** Confirmation dialog for deleting a group role. */
/** Checks whether the current user can manage a specific role. */
export function canManageSpecificRole(
  myRoleId: string | undefined,
  canManageRoles: boolean,
  role: GroupRole,
  canManageRoleFn: (myRoleId: string, targetRoleId: string) => boolean,
): boolean {
  if (!myRoleId) return false;
  if (!canManageRoles) return false;
  if (role.isBuiltIn) return false;
  return canManageRoleFn(myRoleId, role.id);
}

/** Confirmation dialog for deleting a group role. */
export function DeleteRoleDialog({ roleToDelete, onOpenChange, onConfirm }: DeleteRoleDialogProps) {
  return (
    <AlertDialog open={!!roleToDelete} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#1C1D28] border-[#2D3548]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Delete Role &ldquo;{roleToDelete?.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            This action cannot be undone. Members with this role will need to
            be reassigned to another role.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
