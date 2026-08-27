import { useState, useCallback, useMemo } from 'react';
import { debugLog } from '@/lib/debug-config';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import WorkspaceService from '@/lib/workspace-service';
import { buildWorkspacePath, getWorkspacePath } from '@/lib/workspace-navigation';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import { MoveNodeDialog } from './MoveNodeDialog';
import { TreeNodesSection, type DomainNode } from './TreeNodesSection';
import { NodeManagementModal } from '@/components/node/NodeManagementModal';
import { AdminModal } from '@/components/admin';
import { hasUnsavedEdits } from '@/lib/unsaved-edits';
import { DISCARD_EDIT_PROMPT } from '@/components/office/use-unsaved-mdx-guard';
import { useConfirm } from '@/components/shared/confirm-dialog';

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
  const [moveNode, setMoveNode] = useState<DomainNode | null>(null);
  const [adminNode, setAdminNode] = useState<DomainNode | null>(null);
  // The app's dialog, not window.confirm — which is what `confirm` resolves to
  // if this line is missing, silently, with a `string` parameter.
  const confirm = useConfirm();

  // Build flat node list from state
  const nodes = useMemo(() => Object.values(state.nodes), [state.nodes]);

  const handleNodeSelect = useCallback(async (nodeId: string) => {
    // Ask before discarding an edit. `beforeunload` covers closing the tab and
    // nothing else, and this is the click that loses the most work: selecting a
    // node unmounts the editor, because BaseOffice is keyed by node.
    if (hasUnsavedEdits() && !(await confirm(DISCARD_EDIT_PROMPT))) return;

    const newParams = new URLSearchParams(location.search);
    newParams.set('nodeId', nodeId);
    newParams.delete('section');
    // Clear P2P chat overlay when navigating to a different node
    newParams.delete('showP2P');
    newParams.delete('channel');
    newParams.delete('p2pUser');
    navigate(buildWorkspacePath(newParams));
  }, [location.search, navigate, confirm]);

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
      // Rethrow. TreeNodesSection's dialog closes only on success and renders
      // its own role="alert" with the reason — and that entire path was dead,
      // because this handler always resolved. Two layers of failure handling,
      // neither of which could fire. The toast stays for callers that do not
      // present their own error.
      toastError(
        toast,
        'Could not delete',
        error instanceof Error ? error.message : 'Failed to delete node. Please try again.'
      );
      throw error;
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
        // "Initialize the workspace to become an admin" was true once and is
        // not now: since the first-connect-admin change, initialization
        // requires the operator's master password, so a member following that
        // advice hits a modal they cannot complete. And this branch is
        // effectively unreachable anyway -- GetTreeSchema returns the same
        // global schema to everyone, with no actor check, and the default
        // schema always permits an Office under the workspace. The real refusal
        // arrives from the server after submit, which is where it is now
        // reported verbatim.
        toastError(
          toast,
          'Cannot create here',
          'This workspace does not allow new items at the top level.',
        );
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

  const handleMove = useCallback(async (nodeId: string, newParentId: string | null) => {
    try {
      await WorkspaceService.moveNode(nodeId, newParentId);
      toastSuccess(toast, 'Moved', 'The change has been saved.');
    } catch (error) {
      debugLog('HierarchySidebar', 'Error moving node:', error);
      toastError(
        toast,
        'Could not move it',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setMoveNode(null);
    }
  }, [toast]);

  const adminEntityType = adminNode
    ? getEntityTypeString(adminNode.entity_type).toLowerCase()
    : 'workspace';

  return (
    <>
      <TreeNodesSection
      // The create button needs the tree schema to know what child types are
      // allowed; until it arrives, clicking it can only produce an error toast.
      canCreate={Boolean(state.treeSchema)}
        nodes={nodes.length > 0 ? nodes : undefined}
        selectedNodeId={selectedNodeId ?? undefined}
        onNodeSelect={handleNodeSelect}
        onNodeEdit={handleNodeEdit}
        onNodeDelete={handleNodeDelete}
        onNodeCreate={handleNodeCreate}
        onAdminSettings={handleAdminSettings}
        onSetDefault={handleSetDefault}
        onMoveNode={setMoveNode}
        title="HIERARCHY"
        isLoading={state.loading.nodes}
      />

      <MoveNodeDialog
        node={moveNode}
        nodes={state.nodes}
        onMove={(nodeId, parentId) => void handleMove(nodeId, parentId)}
        onClose={() => setMoveNode(null)}
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
