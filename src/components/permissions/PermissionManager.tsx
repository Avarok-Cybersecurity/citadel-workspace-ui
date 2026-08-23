import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import WorkspaceService from '@/lib/workspace-service';
import type { PermissionTS, UpdateOperationTS } from '@/types/workspace-protocol';
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

type RolePermissions = Record<string, Set<string>>;

export const PermissionManager: React.FC<PermissionManagerProps> = ({
  userId,
  domainId,
  domainType,
  onClose,
}) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Track permissions per role
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(() => {
    const initial: RolePermissions = {};
    for (const role of ROLE_HIERARCHY) {
      initial[role.value] = new Set(getRoleDefaultPermissions(role.value));
    }
    return initial;
  });

  useEffect(() => {
    runAsyncSetup(async () => {
      try {
        await WorkspaceService.getUserPermissions(userId, domainId);
      } catch (error) {
        debugLog('PermissionManager', 'Error loading permissions:', error);
      }
    });
  }, [userId, domainId]);

  const togglePermission = useCallback((role: string, permissionId: string) => {
    setRolePermissions(prev => {
      const next = { ...prev };
      const perms = new Set(next[role]);
      if (perms.has(permissionId)) {
        perms.delete(permissionId);
      } else {
        perms.add(permissionId);
      }
      next[role] = perms;
      return next;
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save permission overrides for each role
      for (const role of ROLE_HIERARCHY) {
        const currentPerms = rolePermissions[role.value];
        const roleDefaults = new Set(getRoleDefaultPermissions(role.value));
        const addedPermissions = [...currentPerms].filter(p => !roleDefaults.has(p));
        const removedPermissions = [...roleDefaults].filter(p => !currentPerms.has(p));

        if (addedPermissions.length > 0) {
          await WorkspaceService.updateMemberPermissions(
            userId, domainId, addedPermissions as PermissionTS[], 'Add' as UpdateOperationTS
          );
        }
        if (removedPermissions.length > 0) {
          await WorkspaceService.updateMemberPermissions(
            userId, domainId, removedPermissions as PermissionTS[], 'Remove' as UpdateOperationTS
          );
        }
      }

      toastSuccess(toast, "Permissions Updated", "Permissions saved successfully.");
      if (onClose) onClose();
    } catch (error) {
      debugLog('PermissionManager', 'Error saving permissions:', error);
      toastError(toast, "Error", "Failed to update permissions. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const DomainIcon = getEntityMetadata(domainType).icon;
  const allPermissions = Object.entries(PERMISSION_CATEGORIES);

  return (
    <div className="bg-background border border-border rounded-xl shadow-2xl shadow-black/40 max-h-[85vh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Permission Manager</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <DomainIcon className="h-3 w-3" />
              {getEntityMetadata(domainType).label} permissions
            </p>
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse">
          {/* Role column headers */}
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              <th className="text-left text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-6 py-3 w-[200px] border-b border-border">
                Permission
              </th>
              {ROLE_HIERARCHY.map(role => (
                <th
                  key={role.value}
                  className="text-center px-3 py-3 border-b border-border min-w-[90px]"
                >
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-foreground/80">
                    <div className={`w-1.5 h-1.5 rounded-full ${role.color}`} />
                    {role.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {allPermissions.map(([category, permissions]) => (
              <React.Fragment key={category}>
                {/* Category header row */}
                <tr>
                  <td
                    colSpan={ROLE_HIERARCHY.length + 1}
                    className="px-6 pt-4 pb-1.5"
                  >
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-purple-400">
                      {category}
                    </span>
                  </td>
                </tr>

                {/* Permission rows */}
                {permissions.map((permission, idx) => (
                  <tr
                    key={permission.id}
                    className={`group hover:bg-purple-500/[0.03] transition-colors ${
                      idx === permissions.length - 1 ? '' : ''
                    }`}
                  >
                    <td className="px-6 py-2">
                      <span className="text-sm text-foreground/80">{permission.label}</span>
                    </td>
                    {ROLE_HIERARCHY.map(role => {
                      const isChecked = rolePermissions[role.value]?.has(permission.id) ?? false;
                      return (
                        <td key={role.value} className="text-center px-3 py-2">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => togglePermission(role.value, permission.id)}
                              className="h-4 w-4 border-surface data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-end px-6 py-4 border-t border-border">
        <div className="flex gap-2">
          {onClose && (
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
              className="text-muted-foreground hover:text-foreground hover:bg-transparent h-9 text-sm"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-purple-600 hover:bg-purple-500 text-foreground h-9 text-sm rounded-lg shadow-lg shadow-purple-500/20 gap-2 px-5"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
