/**
 * GroupRoleEditor Component
 *
 * Dialog for creating or editing a group role.
 * Allows setting name, position, color, and permissions.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import type { GroupRole, GroupPermissions } from '@/types/group';
import { DEFAULT_MEMBER_PERMISSIONS } from '@/types/group';

// ============================================================================
// Types
// ============================================================================

interface GroupRoleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Role to edit, or null for creating a new role */
  role: GroupRole | null;
  /** Existing roles (for position validation) */
  existingRoles: GroupRole[];
  /** Suggested position for new roles */
  suggestedPosition: number;
  /** Callback when role is saved */
  onSave: (role: Omit<GroupRole, 'id' | 'isBuiltIn'>) => void;
}

// ============================================================================
// Constants
// ============================================================================

const PRESET_COLORS = [
  '#FFD700', // Gold
  '#6E59A5', // Purple
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#14B8A6', // Teal
];

const PERMISSION_LABELS: Record<keyof GroupPermissions, { label: string; description: string }> = {
  sendMessages: {
    label: 'Send Messages',
    description: 'Can send messages in the group chat',
  },
  viewMemberList: {
    label: 'View Member List',
    description: 'Can see all members of the group',
  },
  inviteMembers: {
    label: 'Invite Members',
    description: 'Can invite new people to the group',
  },
  kickMembers: {
    label: 'Kick Members',
    description: 'Can remove members from the group (respects hierarchy)',
  },
  manageRoles: {
    label: 'Manage Roles',
    description: 'Can create, edit, and delete roles below their own',
  },
  assignRoles: {
    label: 'Assign Roles',
    description: 'Can assign roles to members (roles below their own)',
  },
  editGroupSettings: {
    label: 'Edit Group Settings',
    description: 'Can change group name and default role',
  },
  deleteGroup: {
    label: 'Delete Group',
    description: 'Can permanently delete the group',
  },
};

// ============================================================================
// Component
// ============================================================================

export function GroupRoleEditor({
  open,
  onOpenChange,
  role,
  existingRoles,
  suggestedPosition,
  onSave,
}: GroupRoleEditorProps) {
  const isEditing = !!role;
  const isBuiltIn = role?.isBuiltIn ?? false;

  // Initialize state
  const [name, setName] = useState(role?.name || '');
  const [position, setPosition] = useState(role?.position ?? suggestedPosition);
  const [color, setColor] = useState(role?.color || '');
  const [permissions, setPermissions] = useState<GroupPermissions>(
    role?.permissions || { ...DEFAULT_MEMBER_PERMISSIONS }
  );
  const [isDefault, setIsDefault] = useState(role?.isDefault ?? false);

  // Validation
  const isPositionValid = useMemo(() => {
    if (position < 1 || position > 99) return false;
    // Check if position is unique (excluding current role if editing)
    return !existingRoles.some(
      r => r.position === position && r.id !== role?.id
    );
  }, [position, existingRoles, role]);

  const isNameValid = name.trim().length > 0;
  const canSave = isNameValid && isPositionValid;

  // Handlers
  const handlePermissionChange = useCallback(
    (key: keyof GroupPermissions, checked: boolean) => {
      setPermissions(prev => ({ ...prev, [key]: checked }));
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!canSave) return;

    onSave({
      name: name.trim(),
      position,
      color: color || undefined,
      permissions,
      isDefault,
    });
  }, [canSave, name, position, color, permissions, isDefault, onSave]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] bg-[#1C2333] border-[#2D3548] text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEditing ? `Edit Role: ${role.name}` : 'Create New Role'}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {isBuiltIn
              ? 'Built-in roles can only have their name and color changed.'
              : 'Configure the role name, position, and permissions.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="roleName" className="text-sm text-gray-300">
              Role Name
            </Label>
            <Input
              id="roleName"
              placeholder="e.g., Moderator"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-[#262C4A] border-[#3D4663] text-white placeholder:text-gray-500"
            />
          </div>

          {/* Position (disabled for built-in roles) */}
          <div className="space-y-2">
            <Label htmlFor="rolePosition" className="text-sm text-gray-300">
              Position (1-99, higher = more authority)
            </Label>
            <Input
              id="rolePosition"
              type="number"
              min={1}
              max={99}
              value={position}
              onChange={e => setPosition(parseInt(e.target.value) || 0)}
              disabled={isBuiltIn}
              className={`bg-[#262C4A] border-[#3D4663] text-white ${
                !isPositionValid ? 'border-red-500' : ''
              } ${isBuiltIn ? 'opacity-50' : ''}`}
            />
            {!isPositionValid && (
              <p className="text-xs text-red-400">
                Position must be unique and between 1-99
              </p>
            )}
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-300">Role Color (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(presetColor => (
                <button
                  key={presetColor}
                  onClick={() => setColor(presetColor)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === presetColor
                      ? 'ring-2 ring-offset-2 ring-offset-[#1C2333] ring-white'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: presetColor }}
                />
              ))}
              <button
                onClick={() => setColor('')}
                className={`w-7 h-7 rounded-full border-2 border-dashed border-gray-500 text-xs text-gray-500 ${
                  !color ? 'ring-2 ring-offset-2 ring-offset-[#1C2333] ring-white' : ''
                }`}
                title="No color"
              >
                ✕
              </button>
            </div>
          </div>

          <Separator className="bg-[#3D4663]" />

          {/* Permissions (disabled for built-in roles) */}
          <div className="space-y-3">
            <Label className="text-sm text-gray-300">Permissions</Label>
            {isBuiltIn && (
              <p className="text-xs text-amber-500">
                Built-in role permissions cannot be modified.
              </p>
            )}
            <div className="space-y-3">
              {(Object.keys(PERMISSION_LABELS) as Array<keyof GroupPermissions>).map(
                key => (
                  <div
                    key={key}
                    className={`flex items-start gap-3 p-2 rounded ${
                      isBuiltIn ? 'opacity-50' : 'hover:bg-[#262C4A]'
                    }`}
                  >
                    <Checkbox
                      id={`perm-${key}`}
                      checked={permissions[key]}
                      onCheckedChange={checked =>
                        handlePermissionChange(key, !!checked)
                      }
                      disabled={isBuiltIn}
                      className="mt-0.5 border-[#3D4663] data-[state=checked]:bg-[#6E59A5] data-[state=checked]:border-[#6E59A5]"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`perm-${key}`}
                        className="text-sm font-medium text-white cursor-pointer"
                      >
                        {PERMISSION_LABELS[key].label}
                      </label>
                      <p className="text-xs text-gray-400">
                        {PERMISSION_LABELS[key].description}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <Separator className="bg-[#3D4663]" />

          {/* Default Role Toggle */}
          <div className="flex items-center justify-between p-2 rounded hover:bg-[#262C4A]">
            <div>
              <Label className="text-sm text-white">Set as Default Role</Label>
              <p className="text-xs text-gray-400">
                New members will be assigned this role when they join
              </p>
            </div>
            <Checkbox
              checked={isDefault}
              onCheckedChange={checked => setIsDefault(!!checked)}
              disabled={isBuiltIn}
              className="border-[#3D4663] data-[state=checked]:bg-[#6E59A5] data-[state=checked]:border-[#6E59A5]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-[#6E59A5] hover:bg-[#5D4A94] text-white"
          >
            {isEditing ? 'Save Changes' : 'Create Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GroupRoleEditor;
