import { useState, useCallback, useMemo } from 'react';
import { debugLog } from '@/lib/debug-config';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import WorkspaceService from '@/lib/workspace-service';
import { buildWorkspacePath, getWorkspacePath } from '@/lib/workspace-navigation';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import { TreeNodesSection, type DomainNode } from './TreeNodesSection';
import { NodeManagementModal } from '@/components/node/NodeManagementModal';
import { AdminModal } from '@/components/admin';

/**
 * Orchestrator component that wires TreeNodesSection to workspace state.
 * Replaces the hardcoded OfficesSection + RoomsSection with a schema-driven tree.
 */
export function HierarchySidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const { toast } = useToast();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedNodeId = params.get('nodeId');

  // Modal state
  const [createModal, setCreateModal] = useState<{ parentId: string; entityType: string } | null>(null);
  const [editNode, setEditNode] = useState<DomainNode | null>(null);
  const [adminNode, setAdminNode] = useState<DomainNode | null>(null);

  // Build flat node list from state
  const nodes = useMemo(() => Object.values(state.nodes), [state.nodes]);

  const handleNodeSelect = useCallback((nodeId: string) => {
    const newParams = new URLSearchParams(location.search);
    newParams.set('nodeId', nodeId);
    newParams.delete('section');
    // Clear P2P chat overlay when navigating to a different node
    newParams.delete('showP2P');
    newParams.delete('channel');
    newParams.delete('p2pUser');
    navigate(buildWorkspacePath(newParams));
  }, [location.search, navigate]);

  const handleNodeEdit = useCallback((node: DomainNode) => {
    setEditNode(node);
  }, []);

  const handleNodeDelete = useCallback(async (node: DomainNode) => {
    try {
      await WorkspaceService.deleteNode(node.id, true);

      // If we're currently viewing the deleted node, navigate away
      if (selectedNodeId === node.id) {
        navigate(getWorkspacePath());
      }

      const typeName = getEntityTypeString(node.entity_type);
      toastSuccess(toast, `${typeName} Deleted`, `${node.name} has been deleted successfully`);
    } catch (error) {
      debugLog('HierarchySidebar', 'Error deleting node:', error);
      toastError(toast, 'Error', 'Failed to delete node. Please try again.');
    }
  }, [selectedNodeId, navigate, toast]);

  const handleNodeCreate = useCallback((parentId: string | null) => {
    if (parentId === null) {
      // Creating a root-level child under the synthetic workspace root.
      // Allowed types come from the tree schema.
      //
      // Distinguish two empty-allowedTypes cases that look identical
      // syntactically but have very different user-facing meanings:
      //
      //   1. `state.treeSchema === undefined` — schema fetch is still
      //      in flight (post-auth bootstrap hasn't finished, or the
      //      user clicked the create button before workspace load
      //      completed). The right message is "still loading", not
      //      "permission denied" — the latter is an actively
      //      misleading regression that previously made admins think
      //      their permissions were broken.
      //
      //   2. `state.treeSchema` is loaded but the Workspace rule has
      //      no `allowed_child_types`. That's the genuine
      //      "non-admin trying to create at workspace level" case
      //      and the permission toast is correct.
      if (!state.treeSchema) {
        toastError(toast, 'Loading', 'Workspace schema is still loading. Please try again in a moment.');
        return;
      }
      const workspaceRule = state.treeSchema.rules?.find(
        r => r.parent_type === 'Workspace'
      );
      const allowedTypes = workspaceRule?.allowed_child_types ?? [];
      if (allowedTypes.length === 0) {
        toastError(toast, 'Permission Required', 'You need administrator permissions to create new items. Initialize the workspace to become an admin.');
        return;
      }
      setCreateModal({ parentId: 'workspace-root', entityType: allowedTypes[0] });
      return;
    }

    const parentNode = state.nodes[parentId];
    if (!parentNode) return;

    const allowedTypes = parentNode.allowed_child_types;
    if (!allowedTypes || allowedTypes.length === 0) {
      toastError(toast, 'Cannot Add Here', `No child types are allowed under "${parentNode.name}".`);
      return;
    }

    // If only one child type allowed, use it directly
    // If multiple, default to first (future: show type picker)
    setCreateModal({ parentId, entityType: allowedTypes[0] });
  }, [state.nodes, state.treeSchema, toast]);

  const handleAdminSettings = useCallback((node: DomainNode) => {
    setAdminNode(node);
  }, []);

  const handleSetDefault = useCallback(async (node: DomainNode) => {
    try {
      await WorkspaceService.updateNode(node.id, { isDefault: true });
      const typeName = getEntityTypeString(node.entity_type);
      toastSuccess(toast, `Default ${typeName} Updated`, `${node.name} is now the default`);
    } catch (error) {
      debugLog('HierarchySidebar', 'Error setting default:', error);
      toastError(toast, 'Error', 'Failed to set as default. Please try again.');
    }
  }, [toast]);

  const adminEntityType = adminNode
    ? getEntityTypeString(adminNode.entity_type).toLowerCase()
    : 'workspace';

  return (
    <>
      <TreeNodesSection
        nodes={nodes.length > 0 ? nodes : undefined}
        selectedNodeId={selectedNodeId ?? undefined}
        onNodeSelect={handleNodeSelect}
        onNodeEdit={handleNodeEdit}
        onNodeDelete={handleNodeDelete}
        onNodeCreate={handleNodeCreate}
        onAdminSettings={handleAdminSettings}
        onSetDefault={handleSetDefault}
        title="HIERARCHY"
        isLoading={state.loading.nodes}
      />

      {/* Create Node Modal */}
      {createModal && (
        <NodeManagementModal
          isOpen={true}
          onClose={() => setCreateModal(null)}
          mode="create"
          entityType={createModal.entityType}
          parentId={createModal.parentId}
        />
      )}

      {/* Edit Node Modal */}
      {editNode && (
        <NodeManagementModal
          isOpen={true}
          onClose={() => setEditNode(null)}
          mode="edit"
          entityType={getEntityTypeString(editNode.entity_type)}
          node={editNode}
        />
      )}

      {/* Admin Settings Modal */}
      {adminNode && (
        <AdminModal
          isOpen={true}
          onClose={() => setAdminNode(null)}
          entityType={adminEntityType}
          entityId={adminNode.id}
        />
      )}
    </>
  );
}
