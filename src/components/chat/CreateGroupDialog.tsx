/**
 * CreateGroupDialog Component
 *
 * Modal dialog for creating a new custom peer group.
 * Allows setting group name, settings, and selecting initial members with roles.
 */

import { useState, useMemo, useCallback } from 'react';
import { Plus, Users } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { createDefaultRoles, getDefaultRole } from '@/types/group';
import { debugLog } from '@/lib/debug-config';
import { MembersTable, getAvatarColor } from './CreateGroupMembersTable';
import type { AvailablePeer, SelectedMember, CreateGroupDialogProps } from './create-group-types';

// Re-export types for backward compatibility
export type { AvailablePeer, SelectedMember, CreateGroupDialogProps };

const AVATAR_COLORS_LENGTH = 7;

export function CreateGroupDialog({
  open,
  onOpenChange,
  availablePeers,
  onCreateGroup,
  currentUsername,
}: CreateGroupDialogProps) {
  const defaultRoles = useMemo(() => createDefaultRoles(), []);
  const memberRole = useMemo(
    () => getDefaultRole({ roles: defaultRoles, defaultRoleId: '' }),
    [defaultRoles]
  );

  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [showPeerSelector, setShowPeerSelector] = useState(false);

  const displayName = groupName.trim() || `${currentUsername}'s Group`;

  const unselectedPeers = useMemo(() => {
    const selectedCids = new Set(selectedMembers.map(m => m.cid));
    return availablePeers.filter(p => !selectedCids.has(p.cid));
  }, [availablePeers, selectedMembers]);

  const assignableRoles = useMemo(() => {
    return defaultRoles.filter(r => !r.isBuiltIn);
  }, [defaultRoles]);

  const handleAddMember = useCallback(
    (peer: AvailablePeer) => {
      const newMember: SelectedMember = {
        cid: peer.cid,
        username: peer.username,
        roleId: memberRole?.id || defaultRoles[2].id,
      };
      setSelectedMembers(prev => [...prev, newMember]);
      setShowPeerSelector(false);
    },
    [memberRole, defaultRoles]
  );

  const handleRemoveMember = useCallback((cid: string) => {
    setSelectedMembers(prev => prev.filter(m => m.cid !== cid));
  }, []);

  const handleRoleChange = useCallback((cid: string, roleId: string) => {
    setSelectedMembers(prev =>
      prev.map(m => (m.cid === cid ? { ...m, roleId } : m))
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedMembers.length === 0) return;
    setIsCreating(true);
    try {
      await onCreateGroup(displayName, selectedMembers);
      setGroupName('');
      setSelectedMembers([]);
      onOpenChange(false);
    } catch (error) {
      debugLog('CreateGroupDialog', 'Failed to create group:', error);
    } finally {
      setIsCreating(false);
    }
  }, [displayName, selectedMembers, onCreateGroup, onOpenChange]);

  const handleClose = useCallback(() => {
    if (!isCreating) {
      setGroupName('');
      setSelectedMembers([]);
      onOpenChange(false);
    }
  }, [isCreating, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-[#1C1D28] border-[#2D3548] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5 text-[#6E59A5]" />
            Create New Group
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a group chat with your P2P peers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Group Name Section */}
          <div className="space-y-2">
            <Label htmlFor="groupName" className="text-sm text-gray-300">
              Group Name
            </Label>
            <Input
              id="groupName"
              placeholder={`${currentUsername}'s Group`}
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="bg-[#262C4A] border-[#3D4663] text-white placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500">
              Leave empty to use default: "{currentUsername}'s Group"
            </p>
          </div>

          {/* Members Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-gray-300">Members</Label>
              <Popover open={showPeerSelector} onOpenChange={setShowPeerSelector}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unselectedPeers.length === 0}
                    className="h-8 bg-[#262C4A] border-[#3D4663] text-white hover:bg-[#3D4663]"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-64 p-2 bg-[#1C1D28] border-[#2D3548]"
                  align="end"
                >
                  <ScrollArea className="max-h-48">
                    {unselectedPeers.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">
                        No more peers available
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {unselectedPeers.map(peer => (
                          <button
                            key={peer.cid}
                            onClick={() => handleAddMember(peer)}
                            className="w-full flex items-center gap-2 p-2 rounded hover:bg-[#262C4A] text-left"
                          >
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
                              style={{
                                backgroundColor: getAvatarColor(
                                  parseInt(peer.cid) % AVATAR_COLORS_LENGTH
                                ),
                              }}
                            >
                              {peer.username[0]?.toUpperCase() || '?'}
                            </div>
                            <span className="text-sm text-white flex-1 truncate">
                              {peer.username}
                            </span>
                            {peer.isOnline && (
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <MembersTable
              selectedMembers={selectedMembers}
              assignableRoles={assignableRoles}
              defaultRoles={defaultRoles}
              onRoleChange={handleRoleChange}
              onRemoveMember={handleRemoveMember}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
            className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selectedMembers.length === 0 || isCreating}
            className="bg-[#6E59A5] hover:bg-[#5D4A94] text-white"
          >
            {isCreating ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateGroupDialog;
