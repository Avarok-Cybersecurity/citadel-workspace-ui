/**
 * PermissionsSettingsTab Component
 *
 * Displays user permissions across all domains (workspace, offices, rooms)
 * in a nested accordion structure with permission tables.
 */

import { useState, useEffect, useMemo } from 'react';
import { Loader2, CheckCircle2, XCircle, Building2, FolderOpen, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions, Permission, PERMISSION_CATEGORIES } from '@/contexts/PermissionsContext';
import type { UserRole } from '@/lib/permissions-service';
import { cn } from '@/lib/utils';
import { runAsyncSetup } from '@/lib/utils/async-utils';

/**
 * Role badge component with appropriate styling
 */
function RoleBadge({ role }: { role: UserRole | null }) {
  if (!role) {
    return <Badge variant="outline" className="text-gray-400 border-gray-600">Unknown</Badge>;
  }

  const roleString = typeof role === 'string' ? role : 'Custom';

  const variants: Record<string, string> = {
    Admin: 'bg-purple-600/20 text-purple-400 border-purple-500/50',
    Owner: 'bg-amber-600/20 text-amber-400 border-amber-500/50',
    Member: 'bg-blue-600/20 text-blue-400 border-blue-500/50',
    Guest: 'bg-gray-600/20 text-gray-400 border-gray-500/50',
    Banned: 'bg-red-600/20 text-red-400 border-red-500/50',
    Custom: 'bg-teal-600/20 text-teal-400 border-teal-500/50',
  };

  return (
    <Badge variant="outline" className={cn('font-medium', variants[roleString] || variants.Custom)}>
      {roleString}
    </Badge>
  );
}

/**
 * Permission status icon
 */
function PermissionStatus({ allowed }: { allowed: boolean }) {
  if (allowed) {
    return (
      <div className="flex items-center gap-1.5 text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm">Allowed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-red-400">
      <XCircle className="h-4 w-4" />
      <span className="text-sm">Denied</span>
    </div>
  );
}

/**
 * Permission table for a specific domain
 */
function PermissionTable({
  domainId,
  filterCategory
}: {
  domainId: string;
  filterCategory?: keyof typeof PERMISSION_CATEGORIES;
}) {
  const { hasPermission, getPermissionLabel } = usePermissions();

  // Get permissions to display based on category filter
  const permissionsToShow = useMemo(() => {
    if (filterCategory) {
      return PERMISSION_CATEGORIES[filterCategory].permissions;
    }
    // Show all permissions grouped by category
    return Object.values(PERMISSION_CATEGORIES).flatMap(cat => cat.permissions);
  }, [filterCategory]);

  // Remove duplicates (Permission.All appears in multiple categories)
  const uniquePermissions = useMemo(() => {
    return [...new Set(permissionsToShow)];
  }, [permissionsToShow]);

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-gray-700 hover:bg-transparent">
          <TableHead className="text-gray-400 w-1/2">Permission</TableHead>
          <TableHead className="text-gray-400">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {uniquePermissions.map((permission) => (
          <TableRow key={permission} className="border-gray-700/50 hover:bg-gray-800/50">
            <TableCell className="text-gray-300 font-medium">
              {getPermissionLabel(permission)}
            </TableCell>
            <TableCell>
              <PermissionStatus allowed={hasPermission(domainId, permission)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Grouped permission table showing permissions by category
 */
function GroupedPermissionTable({ domainId }: { domainId: string }) {
  const { hasPermission, getPermissionLabel } = usePermissions();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['content', 'messaging']);

  return (
    <Accordion
      type="multiple"
      value={expandedCategories}
      onValueChange={setExpandedCategories}
      className="w-full"
    >
      {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
        const allowedCount = category.permissions.filter(p => hasPermission(domainId, p)).length;
        const totalCount = category.permissions.length;

        return (
          <AccordionItem key={key} value={key} className="border-gray-700/50">
            <AccordionTrigger className="text-gray-300 hover:text-white hover:no-underline py-2">
              <div className="flex items-center gap-3">
                <span>{category.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    allowedCount === totalCount
                      ? 'bg-green-600/20 text-green-400 border-green-500/50'
                      : allowedCount === 0
                        ? 'bg-red-600/20 text-red-400 border-red-500/50'
                        : 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50'
                  )}
                >
                  {allowedCount}/{totalCount}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1 pl-4">
                {category.permissions.map((permission) => (
                  <div
                    key={permission}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-gray-400">{getPermissionLabel(permission)}</span>
                    <PermissionStatus allowed={hasPermission(domainId, permission)} />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

/**
 * Child node permission section (e.g., Room)
 */
function ChildNodePermissionSection({
  nodeId,
  nodeName
}: {
  nodeId: string;
  nodeName: string;
}) {
  const { getRole, fetchPermissionsForDomain, loading } = usePermissions();
  const role = getRole(nodeId);

  useEffect(() => {
    runAsyncSetup(async () => {
      await fetchPermissionsForDomain(nodeId);
    });
  }, [nodeId, fetchPermissionsForDomain]);

  return (
    <AccordionItem value={`child-${nodeId}`} className="border-gray-700/30 border-l-2 border-l-teal-500/30 ml-4">
      <AccordionTrigger className="text-gray-300 hover:text-white hover:no-underline py-2 pl-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-teal-400" />
          <span>{nodeName}</span>
          <RoleBadge role={role} />
          {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-500" />}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pl-6">
        <GroupedPermissionTable domainId={nodeId} />
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Parent node permission section with nested children (e.g., Office with Rooms)
 */
function ParentNodePermissionSection({
  nodeId,
  nodeName,
  children
}: {
  nodeId: string;
  nodeName: string;
  children: Array<{ id: string; name: string }>;
}) {
  const { getRole, fetchPermissionsForDomain, loading } = usePermissions();
  const role = getRole(nodeId);

  useEffect(() => {
    runAsyncSetup(async () => {
      await fetchPermissionsForDomain(nodeId);
    });
  }, [nodeId, fetchPermissionsForDomain]);

  return (
    <AccordionItem value={`node-${nodeId}`} className="border-gray-700/30 border-l-2 border-l-blue-500/30 ml-2">
      <AccordionTrigger className="text-gray-300 hover:text-white hover:no-underline py-2 pl-3">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-4 w-4 text-blue-400" />
          <span>{nodeName}</span>
          <RoleBadge role={role} />
          {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-500" />}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pl-4">
        <div className="mb-4">
          <GroupedPermissionTable domainId={nodeId} />
        </div>

        {children.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-400 mb-2 pl-2">Children</h4>
            <Accordion type="multiple" className="w-full">
              {children.map((child) => (
                <ChildNodePermissionSection
                  key={child.id}
                  nodeId={child.id}
                  nodeName={child.name}
                />
              ))}
            </Accordion>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Main PermissionsSettingsTab component
 */
export function PermissionsSettingsTab() {
  const { state } = useWorkspace();
  const {
    getRole,
    loading,
    error,
    refreshPermissions,
    fetchPermissionsForDomain
  } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const workspaceId = state.workspace?.id;
  const workspaceName = state.workspace?.name || 'Workspace';
  const workspaceRole = workspaceId ? getRole(workspaceId) : null;

  // Fetch workspace permissions on mount
  useEffect(() => {
    if (workspaceId) {
      runAsyncSetup(async () => {
        await fetchPermissionsForDomain(workspaceId);
      });
    }
  }, [workspaceId, fetchPermissionsForDomain]);

  // Group child nodes by parent hierarchy via entity_type
  const nodesWithChildren = useMemo(() => {
    const allNodes = Object.values(state.nodes);
    // Parent nodes: those whose children can have children (e.g., 'Office' has 'Room' children)
    const parentNodes = allNodes.filter(n =>
      typeof n.entity_type === 'object' && 'Child' in n.entity_type && n.entity_type.Child === 'Office'
    );
    // Leaf nodes: those without children (e.g., 'Room')
    const leafNodes = allNodes.filter(n =>
      typeof n.entity_type === 'object' && 'Child' in n.entity_type && n.entity_type.Child === 'Room'
    );

    return parentNodes.map(parent => ({
      id: parent.id,
      name: parent.name,
      children: leafNodes
        .filter(leaf => leaf.parent_id === parent.id)
        .map(leaf => ({ id: leaf.id, name: leaf.name })),
    }));
  }, [state.nodes]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPermissions();
    setIsRefreshing(false);
  };

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Building2 className="h-12 w-12 mb-4 opacity-50" />
        <p>No workspace loaded</p>
        <p className="text-sm text-gray-500 mt-1">Join a workspace to view your permissions</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <XCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-red-400">Failed to load permissions</p>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-200">Your Permissions</h3>
          <p className="text-sm text-gray-500 mt-1">
            View your access rights across all domains
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="text-gray-400 border-gray-600 hover:bg-gray-700"
        >
          {isRefreshing || loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Nested Permission Tree */}
      <Accordion type="multiple" defaultValue={[`workspace-${workspaceId}`]} className="w-full">
        {/* Workspace Level */}
        <AccordionItem value={`workspace-${workspaceId}`} className="border-gray-700">
          <AccordionTrigger className="text-gray-200 hover:text-white hover:no-underline">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-purple-400" />
              <span className="font-medium">{workspaceName}</span>
              <RoleBadge role={workspaceRole} />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="pl-2 space-y-4">
              {/* Workspace Permissions */}
              <div className="mb-4">
                <GroupedPermissionTable domainId={workspaceId} />
              </div>

              {/* Nodes */}
              {nodesWithChildren.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Nodes</h4>
                  <Accordion type="multiple" className="w-full">
                    {nodesWithChildren.map((node) => (
                      <ParentNodePermissionSection
                        key={node.id}
                        nodeId={node.id}
                        nodeName={node.name}
                        children={node.children}
                      />
                    ))}
                  </Accordion>
                </div>
              )}

              {nodesWithChildren.length === 0 && (
                <p className="text-sm text-gray-500 italic pl-2">
                  No nodes in this workspace
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Legend */}
      <div className="border-t border-gray-700 pt-4">
        <p className="text-xs text-gray-500 mb-2">Legend</p>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-gray-400">Allowed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-gray-400">Denied</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-gray-400">Workspace</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-gray-400">Office</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-gray-400">Room</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PermissionsSettingsTab;
