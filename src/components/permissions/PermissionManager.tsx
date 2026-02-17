import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import WorkspaceService from '@/lib/workspace-service';
import { useToast } from '@/hooks/use-toast';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { getEntityMetadata } from '@/lib/entity-type-registry';
import { debugLog } from '@/lib/debug-config';
import {
  PERMISSION_CATEGORIES,
  ROLE_HIERARCHY,
  getRoleDefaultPermissions,
} from './permission-constants';

interface PermissionManagerProps {
  userId: string;
  domainId: string;
  domainType: string;
  onClose?: () => void;
}

export const PermissionManager: React.FC<PermissionManagerProps> = ({
  userId,
  domainId,
  domainType,
  onClose,
}) => {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>('Member');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [inheritedPermissions, setInheritedPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load current user permissions
    runAsyncSetup(loadUserPermissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, domainId]);

  const loadUserPermissions = async () => {
    try {
      await WorkspaceService.getUserPermissions(userId, domainId);
      const rolePermissions = getRoleDefaultPermissions(selectedRole);
      setSelectedPermissions(new Set(rolePermissions));

      if (domainType !== 'workspace') {
        setInheritedPermissions(new Set(['ViewContent', 'ReadMessages']));
      }
    } catch (error) {
      debugLog('PermissionManager', 'Error loading permissions:', error);
      const rolePermissions = getRoleDefaultPermissions(selectedRole);
      setSelectedPermissions(new Set(rolePermissions));
    }
  };

  const handleRoleChange = (newRole: string) => {
    setSelectedRole(newRole);
    const newPermissions = getRoleDefaultPermissions(newRole);
    setSelectedPermissions(new Set(newPermissions));
  };

  const handlePermissionToggle = (permissionId: string) => {
    const newPermissions = new Set(selectedPermissions);
    if (newPermissions.has(permissionId)) {
      newPermissions.delete(permissionId);
    } else {
      newPermissions.add(permissionId);
    }
    setSelectedPermissions(newPermissions);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await WorkspaceService.updateMemberRole(userId, selectedRole);
      toastSuccess(toast, "Permissions Updated", `User role updated to ${selectedRole}.`);

      if (onClose) {
        onClose();
      }
    } catch (error) {
      debugLog('PermissionManager', 'Error saving permissions:', error);
      toastError(toast, "Error", "Failed to update permissions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const DomainIcon = getEntityMetadata(domainType).icon;

  return (
    <Card className="w-full max-w-lg bg-[#343A5C] border-purple-800 max-h-[80vh] flex flex-col">
      <CardHeader className="flex-shrink-0 pb-2">
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Permission Manager
        </CardTitle>
        <CardDescription className="text-gray-300 text-sm flex items-center gap-1">
          <DomainIcon className="h-4 w-4" /> {getEntityMetadata(domainType).label} permissions
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 overflow-hidden space-y-3 pt-0">
        {/* Role Selection - Fixed */}
        <div className="flex-shrink-0 space-y-1">
          <Label htmlFor="role" className="text-white text-sm">User Role</Label>
          <Select value={selectedRole} onValueChange={handleRoleChange}>
            <SelectTrigger id="role" className="bg-[#444A6C] border-gray-600 text-white h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#444A6C] border-gray-600">
              {ROLE_HIERARCHY.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${role.color}`} />
                    {role.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-gray-600 flex-shrink-0" />

        {/* Scrollable Permissions Area */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3">
          {/* Inherited Permissions */}
          {inheritedPermissions.size > 0 && (
            <div className="space-y-1">
              <Label className="text-white text-sm">Inherited</Label>
              <div className="p-2 bg-[#444A6C] rounded-lg">
                <div className="flex flex-wrap gap-1">
                  {Array.from(inheritedPermissions).map((perm) => (
                    <Badge key={perm} variant="secondary" className="bg-[#555B7C] text-xs">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Permission Categories */}
          <div className="space-y-3">
            <Label className="text-white text-sm">Specific Permissions</Label>
            {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
              <div key={category} className="space-y-1">
                <h4 className="text-xs font-semibold text-purple-300">{category}</h4>
                <div className="space-y-1">
                  {permissions.map((permission) => {
                    const isInherited = inheritedPermissions.has(permission.id);
                    const isSelected = selectedPermissions.has(permission.id);

                    return (
                      <div
                        key={permission.id}
                        className={`flex items-center space-x-2 p-1.5 rounded ${
                          isInherited ? 'bg-[#3A4058] opacity-75' : 'bg-[#444A6C]'
                        }`}
                      >
                        <Checkbox
                          id={permission.id}
                          checked={isSelected || isInherited}
                          disabled={isInherited}
                          onCheckedChange={() => handlePermissionToggle(permission.id)}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={permission.id}
                            className="text-xs font-medium text-white cursor-pointer"
                          >
                            {permission.label}
                            {isInherited && (
                              <span className="ml-1 text-gray-500">(inherited)</span>
                            )}
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons - Fixed */}
        <div className="flex-shrink-0 flex justify-end gap-2 pt-2 border-t border-gray-600">
          {onClose && (
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
              className="text-white hover:bg-[#444A6C] h-8 text-sm"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-sm"
          >
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
