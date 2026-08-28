import { PermissionMatrixTable } from './PermissionMatrixTable';
import React, { useState, useEffect, useCallback } from 'react';
import { describeFailure } from '@/lib/failure-message';
import { useLoadedPermissions } from './use-loaded-permissions';
import { PermissionMatrixNotice } from './PermissionMatrixNotice';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WorkspaceService from '@/lib/workspace-service';
import type { PermissionTS, UpdateOperationTS } from '@/types/workspace-protocol';
import { useToast } from '@/hooks/use-toast';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
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

  // What the SERVER currently grants. The load used to be fired and its result
  // discarded even on success, so the matrix below rendered client-side default
  // constants and Save diffed against those — see use-loaded-permissions.
  const load = useLoadedPermissions(userId, domainId);

  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(() => {
    const initial: RolePermissions = {};
    for (const role of ROLE_HIERARCHY) {
      initial[role.value] = new Set(getRoleDefaultPermissions(role.value));
    }
    return initial;
  });

  // The set the diff is taken against. Held separately from the editable state
  // so Save can compute what actually CHANGED rather than how the edits differ
  // from a default nobody consulted.
  const [serverPermissions, setServerPermissions] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (load.status !== 'loaded') return;
    setServerPermissions(load.permissions);
    setRolePermissions((prev) => ({
      ...prev,
      // The user's own role is the row that describes THEM; the rest of the
      // matrix stays at its defaults, which is what it has always shown.
      [load.role]: new Set(load.permissions),
    }));
  }, [load]);

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
    // Refused rather than guessed. Saving without knowing what the server has
    // is how the defaults got written over real permissions.
    if (load.status !== 'loaded' || !serverPermissions) return;

    setIsSaving(true);
    try {
      // Diffed against what the SERVER has, for the row that describes this
      // user. It used to diff every role's row against that role's client-side
      // DEFAULTS and apply all four to this one user — so an admin who changed
      // nothing still sent writes, and every write was relative to a baseline
      // the server had never agreed to.
      const edited = rolePermissions[load.role] ?? new Set<string>();
      const addedPermissions = [...edited].filter((p) => !serverPermissions.has(p));
      const removedPermissions = [...serverPermissions].filter((p) => !edited.has(p));

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

      toastSuccess(toast, "Permissions Updated", "Permissions saved successfully.");
      if (onClose) onClose();
    } catch (error) {
      debugLog('PermissionManager', 'Error saving permissions:', error);
      toastError(toast, "Error", describeFailure(error, "Failed to update permissions. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const DomainIcon = getEntityMetadata(domainType).icon;
  const allPermissions = Object.entries(PERMISSION_CATEGORIES);

  return (
    <div className="bg-background border border-border rounded-xl shadow-2xl shadow-black/40 max-h-[85vh] min-w-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-accent/10 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-primary-accent" />
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

      <PermissionMatrixNotice load={load} />

      <PermissionMatrixTable
        allPermissions={allPermissions}
        rolePermissions={rolePermissions}
        togglePermission={togglePermission}
      />

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
            // Disabled until the server's answer is in. A matrix showing
            // defaults is not something to save.
            disabled={isSaving || load.status !== 'loaded'}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 text-sm rounded-lg shadow-lg shadow-primary-accent/20 gap-2 px-5"
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
