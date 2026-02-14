/**
 * GroupRoleManagement Component
 *
 * Displays and manages roles for a group.
 * Allows creating, editing, and deleting roles (respecting hierarchy).
 */

import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Star, Lock, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import type { GroupRole, GroupConversation, GroupSettings } from '@/types/group';
import { useGroupRoles } from '@/hooks/use-group-roles';
import { useGroupPermissions } from '@/hooks/use-group-permissions';
import { GroupRoleEditor } from './GroupRoleEditor';

// ============================================================================
// Types
// ============================================================================

interface GroupRoleManagementProps {
  group: GroupConversation;
  onSettingsChange: (settings: GroupSettings) => void;
}

// ============================================================================
// Component
// ============================================================================

export function GroupRoleManagement({
  group,
  onSettingsChange,
}: GroupRoleManagementProps) {
  const {
    roles,
    defaultRole,
    createRole,
    updateRole,
    deleteRole,
    setDefaultRole,
    canManageRole,
    suggestPosition,
  } = useGroupRoles(group, onSettingsChange);

  const { myRole, can } = useGroupPermissions(group);

  // State
  const [showEditor, setShowEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<GroupRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<GroupRole | null>(null);

  // Check if user can manage roles
  const canManageRoles = can('manageRoles');

  // Handlers
  const handleCreateRole = useCallback(() => {
    setEditingRole(null);
    setShowEditor(true);
  }, []);

  const handleEditRole = useCallback((role: GroupRole) => {
    setEditingRole(role);
    setShowEditor(true);
  }, []);

  const handleDeleteRole = useCallback((role: GroupRole) => {
    setRoleToDelete(role);
  }, []);

  const confirmDelete = useCallback(() => {
    if (roleToDelete) {
      deleteRole(roleToDelete.id);
      setRoleToDelete(null);
    }
  }, [roleToDelete, deleteRole]);

  const handleSaveRole = useCallback(
    (roleData: Omit<GroupRole, 'id' | 'isBuiltIn'>) => {
      if (editingRole) {
        // Update existing role
        updateRole(editingRole.id, roleData);
      } else {
        // Create new role
        createRole(
          roleData.name,
          roleData.position,
          roleData.permissions,
          roleData.color
        );
      }
      setShowEditor(false);
      setEditingRole(null);
    },
    [editingRole, createRole, updateRole]
  );

  const handleSetDefault = useCallback(
    (roleId: string) => {
      setDefaultRole(roleId);
    },
    [setDefaultRole]
  );

  // Check if user can manage a specific role
  const canManageSpecificRole = (role: GroupRole): boolean => {
    if (!myRole) return false;
    if (!canManageRoles) return false;
    if (role.isBuiltIn) return false;
    return canManageRole(myRole.id, role.id);
  };

  // Format permissions summary
  const formatPermissions = (role: GroupRole): string => {
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
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Roles</h3>
        {canManageRoles && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateRole}
            className="h-8 bg-[#262C4A] border-[#3D4663] text-white hover:bg-[#3D4663]"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Role
          </Button>
        )}
      </div>

      {/* Role List */}
      <ScrollArea className="max-h-[300px]">
        <div className="space-y-2">
          {roles.map(role => {
            const isDefault = role.id === defaultRole?.id;
            const canEdit = canManageSpecificRole(role);
            const canDelete = canEdit && !isDefault;

            return (
              <div
                key={role.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#262C4A] border border-[#3D4663] group"
              >
                {/* Drag Handle (placeholder for future drag-to-reorder) */}
                <div className="text-gray-500 cursor-grab">
                  <GripVertical className="h-4 w-4" />
                </div>

                {/* Role Color & Icon */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {role.color ? (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-gray-500" />
                  )}
                  {role.isBuiltIn && (
                    <span title="Built-in role"><Lock className="h-3 w-3 text-amber-500" /></span>
                  )}
                </div>

                {/* Role Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {role.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      (position: {role.position})
                    </span>
                    {isDefault && (
                      <Badge
                        variant="outline"
                        className="h-5 text-xs bg-[#6E59A5]/20 border-[#6E59A5] text-[#9b87f5]"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {formatPermissions(role)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isDefault && canManageRoles && !role.isBuiltIn && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                      onClick={() => handleSetDefault(role.id)}
                      title="Set as default role"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}

                  {(canEdit || role.isBuiltIn) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-white hover:bg-[#3D4663]"
                      onClick={() => handleEditRole(role)}
                      title="Edit role"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}

                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => handleDeleteRole(role)}
                      title="Delete role"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Role Editor Dialog */}
      {showEditor && (
        <GroupRoleEditor
          open={showEditor}
          onOpenChange={open => {
            setShowEditor(open);
            if (!open) setEditingRole(null);
          }}
          role={editingRole}
          existingRoles={roles}
          suggestedPosition={suggestPosition()}
          onSave={handleSaveRole}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!roleToDelete} onOpenChange={() => setRoleToDelete(null)}>
        <AlertDialogContent className="bg-[#1C2333] border-[#2D3548]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Role "{roleToDelete?.name}"?
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
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GroupRoleManagement;
