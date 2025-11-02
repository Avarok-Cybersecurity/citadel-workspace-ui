import React, { useState, useEffect } from 'react';
import { Shield, ChevronDown, Check, X } from 'lucide-react';
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
import { User, UserRole } from '@/types/workspace-entities';

interface PermissionManagerProps {
  userId: string;
  domainId: string;
  domainType: 'workspace' | 'office' | 'room';
  onClose?: () => void;
}

// Permission categories for better organization
const PERMISSION_CATEGORIES = {
  Content: [
    { id: 'ViewContent', label: 'View Content', description: 'Can view content in this domain' },
    { id: 'EditContent', label: 'Edit Content', description: 'Can modify content' },
    { id: 'EditMdx', label: 'Edit MDX', description: 'Can edit MDX documents' },
  ],
  Messaging: [
    { id: 'SendMessages', label: 'Send Messages', description: 'Can send messages' },
    { id: 'ReadMessages', label: 'Read Messages', description: 'Can read messages' },
  ],
  Files: [
    { id: 'UploadFiles', label: 'Upload Files', description: 'Can upload files' },
    { id: 'DownloadFiles', label: 'Download Files', description: 'Can download files' },
  ],
  Members: [
    { id: 'AddUsers', label: 'Add Users', description: 'Can add new members' },
    { id: 'RemoveUsers', label: 'Remove Users', description: 'Can remove members' },
    { id: 'BanUser', label: 'Ban Users', description: 'Can ban users from domain' },
  ],
  Management: [
    { id: 'CreateRoom', label: 'Create Rooms', description: 'Can create new rooms' },
    { id: 'DeleteRoom', label: 'Delete Rooms', description: 'Can delete rooms' },
    { id: 'UpdateRoom', label: 'Update Rooms', description: 'Can update room settings' },
    { id: 'CreateOffice', label: 'Create Offices', description: 'Can create new offices' },
    { id: 'DeleteOffice', label: 'Delete Offices', description: 'Can delete offices' },
    { id: 'UpdateOffice', label: 'Update Offices', description: 'Can update office settings' },
  ],
  System: [
    { id: 'ManageDomains', label: 'Manage Domains', description: 'Full domain management' },
    { id: 'ConfigureSystem', label: 'Configure System', description: 'System configuration' },
  ],
};

const ROLE_HIERARCHY = [
  { value: 'Admin', label: 'Administrator', color: 'bg-red-500' },
  { value: 'Owner', label: 'Owner', color: 'bg-orange-500' },
  { value: 'Member', label: 'Member', color: 'bg-blue-500' },
  { value: 'Guest', label: 'Guest', color: 'bg-gray-500' },
];

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
    loadUserPermissions();
  }, [userId, domainId]);

  const loadUserPermissions = async () => {
    try {
      // TODO: Load actual permissions from backend
      // For now, simulate based on role
      const rolePermissions = getRoleDefaultPermissions(selectedRole);
      setSelectedPermissions(new Set(rolePermissions));
      
      // Simulate inherited permissions from parent domains
      if (domainType !== 'workspace') {
        setInheritedPermissions(new Set(['ViewContent', 'ReadMessages']));
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const getRoleDefaultPermissions = (role: string): string[] => {
    switch (role) {
      case 'Admin':
        return Object.values(PERMISSION_CATEGORIES).flat().map(p => p.id);
      case 'Owner':
        return [
          'ViewContent', 'EditContent', 'EditMdx',
          'SendMessages', 'ReadMessages',
          'UploadFiles', 'DownloadFiles',
          'AddUsers', 'RemoveUsers',
          'CreateRoom', 'DeleteRoom', 'UpdateRoom',
        ];
      case 'Member':
        return [
          'ViewContent', 'EditContent',
          'SendMessages', 'ReadMessages',
          'UploadFiles', 'DownloadFiles',
        ];
      case 'Guest':
        return ['ViewContent', 'ReadMessages'];
      default:
        return [];
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
      // TODO: Save permissions to backend
      // await WorkspaceService.updateUserPermissions(userId, domainId, {
      //   role: selectedRole,
      //   permissions: Array.from(selectedPermissions),
      // });

      toast({
        title: "Permissions Updated",
        description: "User permissions have been successfully updated.",
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });

      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast({
        title: "Error",
        description: "Failed to update permissions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDomainIcon = () => {
    switch (domainType) {
      case 'workspace':
        return '🏢';
      case 'office':
        return '🏛️';
      case 'room':
        return '🚪';
      default:
        return '📁';
    }
  };

  return (
    <Card className="w-full max-w-4xl bg-[#343A5C] border-purple-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Permission Manager
        </CardTitle>
        <CardDescription className="text-gray-300">
          Manage user permissions for {getDomainIcon()} {domainType}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Role Selection */}
        <div className="space-y-2">
          <Label htmlFor="role" className="text-white">User Role</Label>
          <Select value={selectedRole} onValueChange={handleRoleChange}>
            <SelectTrigger id="role" className="bg-[#444A6C] border-gray-600 text-white">
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

        <Separator className="bg-gray-600" />

        {/* Inherited Permissions */}
        {inheritedPermissions.size > 0 && (
          <>
            <div className="space-y-2">
              <Label className="text-white">Inherited Permissions</Label>
              <div className="p-3 bg-[#444A6C] rounded-lg">
                <p className="text-sm text-gray-300 mb-2">
                  These permissions are inherited from parent domains:
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(inheritedPermissions).map((perm) => (
                    <Badge key={perm} variant="secondary" className="bg-[#555B7C]">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <Separator className="bg-gray-600" />
          </>
        )}

        {/* Permission Categories */}
        <div className="space-y-4">
          <Label className="text-white">Specific Permissions</Label>
          {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-sm font-semibold text-purple-300">{category}</h4>
              <div className="space-y-2">
                {permissions.map((permission) => {
                  const isInherited = inheritedPermissions.has(permission.id);
                  const isSelected = selectedPermissions.has(permission.id);
                  
                  return (
                    <div
                      key={permission.id}
                      className={`flex items-start space-x-3 p-2 rounded ${
                        isInherited ? 'bg-[#3A4058] opacity-75' : 'bg-[#444A6C]'
                      }`}
                    >
                      <Checkbox
                        id={permission.id}
                        checked={isSelected || isInherited}
                        disabled={isInherited}
                        onCheckedChange={() => handlePermissionToggle(permission.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={permission.id}
                          className="text-sm font-medium text-white cursor-pointer"
                        >
                          {permission.label}
                        </Label>
                        <p className="text-xs text-gray-400">{permission.description}</p>
                        {isInherited && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            Inherited
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-4">
          {onClose && (
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
              className="text-white hover:bg-[#444A6C]"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isLoading ? 'Saving...' : 'Save Permissions'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};