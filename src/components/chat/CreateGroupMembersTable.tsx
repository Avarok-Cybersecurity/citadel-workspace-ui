/**
 * CreateGroupMembersTable Component
 *
 * Renders the table of selected members with role assignment and removal
 * for the CreateGroupDialog.
 */

import { X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GroupRole } from '@/types/group';
import type { SelectedMember } from './create-group-types';

const AVATAR_COLORS = [
  '#6E59A5', // Purple
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
];

export function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

interface MembersTableProps {
  selectedMembers: SelectedMember[];
  assignableRoles: GroupRole[];
  defaultRoles: GroupRole[];
  onRoleChange: (cid: string, roleId: string) => void;
  onRemoveMember: (cid: string) => void;
}

export function MembersTable({
  selectedMembers,
  assignableRoles,
  defaultRoles,
  onRoleChange,
  onRemoveMember,
}: MembersTableProps) {
  if (selectedMembers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[#3D4663] p-6 text-center">
        <Users className="h-8 w-8 mx-auto text-gray-500 mb-2" />
        <p className="text-sm text-gray-500">
          Add members to your group using the button above
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#2D3548] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-[#2D3548] hover:bg-transparent">
            <TableHead className="text-gray-400 h-9">User</TableHead>
            <TableHead className="text-gray-400 h-9 w-32">Role</TableHead>
            <TableHead className="text-gray-400 h-9 w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {selectedMembers.map((member, index) => (
            <TableRow
              key={member.cid}
              className="border-[#2D3548] hover:bg-[#262C4A]"
            >
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
                    style={{ backgroundColor: getAvatarColor(index) }}
                  >
                    {member.username[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm text-white">{member.username}</span>
                </div>
              </TableCell>
              <TableCell className="py-2">
                <Select
                  value={member.roleId}
                  onValueChange={value => onRoleChange(member.cid, value)}
                >
                  <SelectTrigger className="h-8 w-28 bg-[#262C4A] border-[#3D4663] text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1C2333] border-[#2D3548]">
                    {assignableRoles.map(r => (
                      <SelectItem
                        key={r.id}
                        value={r.id}
                        className="text-white hover:bg-[#262C4A]"
                      >
                        <div className="flex items-center gap-2">
                          {r.color && (
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: r.color }}
                            />
                          )}
                          {r.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="py-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-red-400 hover:bg-transparent"
                  onClick={() => onRemoveMember(member.cid)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
