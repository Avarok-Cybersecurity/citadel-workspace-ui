/**
 * GroupSettingsPanel Component
 *
 * Slide-over panel for managing group settings, members, and roles.
 * Contains tabs for Members, Roles, and Settings.
 */

import { useState, useCallback } from 'react';
import { X, Users, Shield, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { GroupConversation, GroupSettings as GroupSettingsType } from '@/types/group';
import { useGroupPermissions } from '@/hooks/useGroupPermissions';
import { GroupMemberManagement } from './GroupMemberManagement';
import { GroupRoleManagement } from './GroupRoleManagement';

// ============================================================================
// Types
// ============================================================================

interface GroupSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupConversation;
  /** Callback when group name is changed */
  onNameChange: (name: string) => Promise<void>;
  /** Callback when settings are changed */
  onSettingsChange: (settings: GroupSettingsType) => void;
  /** Callback when a member's role is changed */
  onMemberRoleChange: (memberCid: string, roleId: string) => Promise<void>;
  /** Callback when a member is kicked */
  onKickMember: (memberCid: string) => Promise<void>;
  /** Callback when the group is deleted */
  onDeleteGroup: () => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function GroupSettingsPanel({
  open,
  onOpenChange,
  group,
  onNameChange,
  onSettingsChange,
  onMemberRoleChange,
  onKickMember,
  onDeleteGroup,
}: GroupSettingsPanelProps) {
  const { can, isOwner } = useGroupPermissions(group);
  const [activeTab, setActiveTab] = useState('members');
  const [groupName, setGroupName] = useState(group.name);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canEditSettings = can('editGroupSettings');
  const canManageRoles = can('manageRoles');
  const canDeleteGroup = can('deleteGroup');

  // Handle name save
  const handleNameSave = useCallback(async () => {
    if (groupName.trim() === group.name) return;

    setIsSaving(true);
    try {
      await onNameChange(groupName.trim());
    } finally {
      setIsSaving(false);
    }
  }, [groupName, group.name, onNameChange]);

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await onDeleteGroup();
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-md bg-[#1C2333] border-l border-[#2D3548] p-0 flex flex-col"
        side="right"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-[#2D3548]">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white text-lg">Group Settings</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-4 mt-4 bg-[#262C4A] border border-[#3D4663]">
            <TabsTrigger
              value="members"
              className="flex-1 data-[state=active]:bg-[#6E59A5]"
            >
              <Users className="h-4 w-4 mr-1" />
              Members
            </TabsTrigger>
            {canManageRoles && (
              <TabsTrigger
                value="roles"
                className="flex-1 data-[state=active]:bg-[#6E59A5]"
              >
                <Shield className="h-4 w-4 mr-1" />
                Roles
              </TabsTrigger>
            )}
            {canEditSettings && (
              <TabsTrigger
                value="settings"
                className="flex-1 data-[state=active]:bg-[#6E59A5]"
              >
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </TabsTrigger>
            )}
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="flex-1 overflow-auto p-4 mt-0">
            <GroupMemberManagement
              group={group}
              onRoleChange={onMemberRoleChange}
              onKickMember={onKickMember}
            />
          </TabsContent>

          {/* Roles Tab */}
          {canManageRoles && (
            <TabsContent value="roles" className="flex-1 overflow-auto p-4 mt-0">
              <GroupRoleManagement group={group} onSettingsChange={onSettingsChange} />
            </TabsContent>
          )}

          {/* Settings Tab */}
          {canEditSettings && (
            <TabsContent value="settings" className="flex-1 overflow-auto p-4 mt-0">
              <div className="space-y-6">
                {/* Group Name */}
                <div className="space-y-2">
                  <Label htmlFor="groupName" className="text-sm text-gray-300">
                    Group Name
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="groupName"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      className="flex-1 bg-[#262C4A] border-[#3D4663] text-white"
                    />
                    <Button
                      onClick={handleNameSave}
                      disabled={isSaving || groupName.trim() === group.name}
                      className="bg-[#6E59A5] hover:bg-[#5D4A94] text-white"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>

                <Separator className="bg-[#3D4663]" />

                {/* Group Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-300">Group Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-[#262C4A] rounded-lg p-3">
                      <p className="text-gray-400">Members</p>
                      <p className="text-white font-medium">{group.members.length}</p>
                    </div>
                    <div className="bg-[#262C4A] rounded-lg p-3">
                      <p className="text-gray-400">Roles</p>
                      <p className="text-white font-medium">
                        {group.settings.roles.length}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                {canDeleteGroup && (
                  <>
                    <Separator className="bg-[#3D4663]" />

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-red-400">Danger Zone</h4>
                      <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
                        <p className="text-sm text-gray-300 mb-3">
                          Permanently delete this group. This action cannot be undone.
                          All messages and settings will be lost.
                        </p>
                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Group
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="bg-[#1C2333] border-[#2D3548]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete "{group.name}"?
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
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? 'Deleting...' : 'Delete Group'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

export default GroupSettingsPanel;
