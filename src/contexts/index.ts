/**
 * Contexts Barrel Export
 *
 * Centralized exports for all React contexts.
 */

export { PermissionsProvider, usePermissions, Permission, PERMISSION_LABELS, PERMISSION_CATEGORIES } from './PermissionsContext';
export type { DomainPermissions, UserRole } from './PermissionsContext';

export { WorkspaceContext, WorkspaceProvider, useWorkspace } from './WorkspaceContext';
export type { WorkspaceState } from './WorkspaceContext';
