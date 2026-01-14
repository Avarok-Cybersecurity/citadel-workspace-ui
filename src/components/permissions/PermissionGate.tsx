/**
 * PermissionGate Component
 *
 * A wrapper component that conditionally renders children based on permissions.
 * When permission is denied, renders children in a disabled state with tooltip.
 */

import React from 'react';
import { usePermission, useAnyPermission, useAllPermissions } from '@/hooks/usePermission';
import { Permission } from '@/contexts/PermissionsContext';
import { DisabledWithTooltip } from '@/components/ui/DisabledWithTooltip';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionGateProps {
  /** Domain ID (workspace, office, or room) */
  domainId: string | undefined | null;
  /** Permission required */
  permission: Permission;
  /** Content to render */
  children: React.ReactNode;
  /** Custom tooltip message (overrides default) */
  disabledTooltip?: string;
  /** Custom fallback when permission denied (instead of disabled state) */
  fallback?: React.ReactNode;
  /** Hide completely instead of showing disabled (default: false) */
  hideWhenDenied?: boolean;
  /** Show loading spinner while checking permissions */
  showLoadingState?: boolean;
  /** Additional class names for the wrapper */
  className?: string;
}

/**
 * Gate content behind a single permission
 *
 * @example
 * ```tsx
 * <PermissionGate
 *   domainId={officeId}
 *   permission={Permission.EditMdx}
 *   disabledTooltip="You don't have permission to edit this content"
 * >
 *   <Button onClick={handleEdit}>Edit</Button>
 * </PermissionGate>
 * ```
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  domainId,
  permission,
  children,
  disabledTooltip,
  fallback,
  hideWhenDenied = false,
  showLoadingState = false,
  className,
}) => {
  const { allowed, loading, reason } = usePermission(domainId, permission);

  // Show loading state
  if (loading && showLoadingState) {
    return (
      <div className={cn('flex items-center justify-center p-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  // Permission granted - render children normally
  if (allowed) {
    return <>{children}</>;
  }

  // Permission denied - hide if requested
  if (hideWhenDenied) {
    return null;
  }

  // Permission denied - show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Permission denied - show disabled state with tooltip
  const tooltip = disabledTooltip || reason || 'Permission denied';
  return (
    <DisabledWithTooltip disabled tooltip={tooltip} className={className}>
      {children}
    </DisabledWithTooltip>
  );
};

/**
 * Gate content behind any of multiple permissions
 */
interface AnyPermissionGateProps extends Omit<PermissionGateProps, 'permission'> {
  /** Permissions - user needs at least one */
  permissions: Permission[];
}

export const AnyPermissionGate: React.FC<AnyPermissionGateProps> = ({
  domainId,
  permissions,
  children,
  disabledTooltip,
  fallback,
  hideWhenDenied = false,
  showLoadingState = false,
  className,
}) => {
  const { allowed, loading, reason } = useAnyPermission(domainId, permissions);

  if (loading && showLoadingState) {
    return (
      <div className={cn('flex items-center justify-center p-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (allowed) {
    return <>{children}</>;
  }

  if (hideWhenDenied) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const tooltip = disabledTooltip || reason || 'Permission denied';
  return (
    <DisabledWithTooltip disabled tooltip={tooltip} className={className}>
      {children}
    </DisabledWithTooltip>
  );
};

/**
 * Gate content behind all of multiple permissions
 */
interface AllPermissionsGateProps extends Omit<PermissionGateProps, 'permission'> {
  /** Permissions - user needs all of them */
  permissions: Permission[];
}

export const AllPermissionsGate: React.FC<AllPermissionsGateProps> = ({
  domainId,
  permissions,
  children,
  disabledTooltip,
  fallback,
  hideWhenDenied = false,
  showLoadingState = false,
  className,
}) => {
  const { allowed, loading, reason } = useAllPermissions(domainId, permissions);

  if (loading && showLoadingState) {
    return (
      <div className={cn('flex items-center justify-center p-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (allowed) {
    return <>{children}</>;
  }

  if (hideWhenDenied) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const tooltip = disabledTooltip || reason || 'Permission denied';
  return (
    <DisabledWithTooltip disabled tooltip={tooltip} className={className}>
      {children}
    </DisabledWithTooltip>
  );
};

/**
 * Gate for admin-only content
 */
interface AdminGateProps {
  domainId: string | undefined | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  hideWhenNotAdmin?: boolean;
}

export const AdminGate: React.FC<AdminGateProps> = ({
  domainId,
  children,
  fallback,
  hideWhenNotAdmin = true,
}) => {
  return (
    <PermissionGate
      domainId={domainId}
      permission={Permission.ConfigureSystem}
      fallback={fallback}
      hideWhenDenied={hideWhenNotAdmin}
      disabledTooltip="This action requires administrator privileges"
    >
      {children}
    </PermissionGate>
  );
};

export default PermissionGate;
