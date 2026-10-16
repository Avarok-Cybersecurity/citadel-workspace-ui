/**
 * "Role permissions": what each role can do, everywhere in the workspace.
 *
 * READ-ONLY, and it says so. The server has no per-role permission storage:
 * role abilities are fixed in code (`Permission::for_role` in
 * citadel-workspace-types), and the only writable grants are per member
 * (`UpdateMemberPermissions`). This used to be an editable matrix with a Save
 * button, and Save could only ever write the signed-in admin's own row, to the
 * admin -- so an edit to the Member or Guest column reported success and sent
 * nothing. A control that cannot hold what it offers is worse than none.
 *
 * The columns are the mirror of `for_role` (`ROLE_DEFAULT_PERMISSIONS`, held to
 * the Rust enum by scripts/check-permission-parity.mjs) -- the same source the
 * matrix showed before, not a copy of it. One person's own permissions are
 * changed from their row in the member list.
 */
import React from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PermissionDefinition } from '@/components/permissions/permission-constants';
import { PERMISSION_CATEGORIES, ROLE_HIERARCHY, getRoleDefaultPermissions } from './permission-constants';
import { PermissionMatrixTable } from './PermissionMatrixTable';

const ROLE_PERMISSIONS: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  ROLE_HIERARCHY.map((role): [string, ReadonlySet<string>] => [role.value, new Set(getRoleDefaultPermissions(role.value))]),
);
const ALL_PERMISSIONS: [string, PermissionDefinition[]][] = Object.entries(PERMISSION_CATEGORIES);

export const PermissionManager: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="bg-background border border-border rounded-xl shadow-2xl shadow-black/40 max-h-[85vh] min-w-0 flex flex-col overflow-hidden">
    <div className="px-6 py-5 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary-accent/10 flex items-center justify-center">
          <Shield className="h-4.5 w-4.5 text-primary-accent" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Role permissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">What each role can do, everywhere in the workspace. Roles are fixed; this is a reference.</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-foreground/80" data-testid="role-permissions-how-to-change">
        To change what one person can do, open their ⋯ menu in the member list and choose Manage Permissions.
      </p>
    </div>

    <PermissionMatrixTable allPermissions={ALL_PERMISSIONS} rolePermissions={ROLE_PERMISSIONS} roleColumns={ROLE_HIERARCHY} />

    <div className="flex-shrink-0 flex items-center justify-end px-6 py-4 border-t border-border">
      <Button variant="outline" onClick={onClose} className="h-9 text-sm">Close</Button>
    </div>
  </div>
);
