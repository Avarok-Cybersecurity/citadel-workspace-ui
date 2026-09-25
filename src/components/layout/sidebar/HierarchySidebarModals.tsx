/**
 * The create, edit and admin-settings modals HierarchySidebar opens.
 *
 * Split out of HierarchySidebar.tsx, which was over the 250-line cap. The
 * sidebar owns which node each modal is for; this only renders them.
 */
import { NodeManagementModal } from '@/components/node/NodeManagementModal';
import { AdminModal } from '@/components/admin';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import type { DomainNode } from './TreeNodesSection';

interface HierarchySidebarModalsProps {
  createModal: { parentId: string; entityType: string } | null;
  editNode: DomainNode | null;
  adminNode: DomainNode | null;
  onCloseCreate: () => void;
  onCloseEdit: () => void;
  onCloseAdmin: () => void;
}

export function HierarchySidebarModals({
  createModal,
  editNode,
  adminNode,
  onCloseCreate,
  onCloseEdit,
  onCloseAdmin,
}: HierarchySidebarModalsProps): JSX.Element {
  const adminEntityType: string = adminNode
    ? getEntityTypeString(adminNode.entity_type).toLowerCase()
    : 'workspace';

  return (
    <>
      {/* Create Node Modal */}
      {createModal && (
        <NodeManagementModal
          isOpen={true}
          onClose={onCloseCreate}
          mode="create"
          entityType={createModal.entityType}
          parentId={createModal.parentId}
        />
      )}

      {/* Edit Node Modal */}
      {editNode && (
        <NodeManagementModal
          isOpen={true}
          onClose={onCloseEdit}
          mode="edit"
          entityType={getEntityTypeString(editNode.entity_type)}
          node={editNode}
        />
      )}

      {/* Admin Settings Modal */}
      {adminNode && (
        <AdminModal
          isOpen={true}
          onClose={onCloseAdmin}
          entityType={adminEntityType}
          entityId={adminNode.id}
        />
      )}
    </>
  );
}
