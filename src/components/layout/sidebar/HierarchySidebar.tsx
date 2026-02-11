import { useState, useCallback, useMemo } from 'react';
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
      console.error('Error deleting node:', error);
      toastError(toast, 'Error', 'Failed to delete node. Please try again.');
    }
  }, [selectedNodeId, navigate, toast]);

  const handleNodeCreate = useCallback((parentId: string | null) => {
    if (parentId === null) {
      // Creating a root-level child under the synthetic workspace root.
      // Allowed types come from the tree schema.
      const workspaceRule = state.treeSchema?.rules?.find(
        r => r.parent_type === 'Workspace'
      );
      const allowedTypes = workspaceRule?.allowed_child_types ?? [];
      if (allowedTypes.length === 0) return;
      setCreateModal({ parentId: 'workspace-root', entityType: allowedTypes[0] });
      return;
    }

    const parentNode = state.nodes[parentId];
    if (!parentNode) return;

    const allowedTypes = parentNode.allowed_child_types;
    if (!allowedTypes || allowedTypes.length === 0) return;

    // If only one child type allowed, use it directly
    // If multiple, default to first (future: show type picker)
    setCreateModal({ parentId, entityType: allowedTypes[0] });
  }, [state.nodes, state.treeSchema]);

  const handleAdminSettings = useCallback((node: DomainNode) => {
    setAdminNode(node);
  }, []);

  const handleSetDefault = useCallback(async (node: DomainNode) => {
    try {
      await WorkspaceService.updateNode(node.id, { isDefault: true });
      const typeName = getEntityTypeString(node.entity_type);
      toastSuccess(toast, `Default ${typeName} Updated`, `${node.name} is now the default`);
    } catch (error) {
      console.error('Error setting default:', error);
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
