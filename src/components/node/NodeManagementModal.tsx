import { useToast } from '@/hooks/use-toast';
import { toastSuccess } from '@/lib/toast-helpers';
import WorkspaceService from '@/lib/workspace-service';
import { getEntityMetadata, getEntityTypeString } from '@/lib/entity-type-registry';
import type { DomainNode } from '@/components/layout/sidebar/TreeNodesSection';
import {
  EntityManagementModal,
  type FieldConfig,
  type ModeConfig,
} from '@/components/shared/EntityManagementModal';

interface NodeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  /** Entity type name for creation (e.g., "Office", "Room", "Department"). */
  entityType: string;
  /** Parent node ID — required for create mode. */
  parentId?: string;
  /** Existing node data — required for edit mode. */
  node?: DomainNode;
}

function buildModes(label: string): Record<'create' | 'edit', ModeConfig> {
  return {
    create: {
      title: `Create New ${label}`,
      description: `Add a new ${label.toLowerCase()} to the hierarchy`,
      submitLabel: `Create ${label}`,
      submittingLabel: 'Creating...',
    },
    edit: {
      title: `Edit ${label}`,
      description: `Update ${label.toLowerCase()} information`,
      submitLabel: `Update ${label}`,
      submittingLabel: 'Updating...',
    },
  };
}

function buildFields(meta: ReturnType<typeof getEntityMetadata>): FieldConfig[] {
  return [
    {
      id: 'name',
      label: `${meta.label} Name`,
      type: 'input',
      placeholder: meta.namePlaceholder,
      required: true,
    },
    {
      id: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: meta.descriptionPlaceholder,
    },
  ];
}

export function NodeManagementModal({
  isOpen,
  onClose,
  mode,
  entityType,
  parentId,
  node,
}: NodeManagementModalProps) {
  const { toast } = useToast();
  const meta = getEntityMetadata(entityType);
  const modes = buildModes(meta.label);
  const fields: FieldConfig[] = buildFields(meta);

  const handleSubmit = async (formData: Record<string, string>): Promise<void> => {
    if (mode === 'create') {
      if (parentId === undefined) {
        throw new Error('parentId is required for create mode');
      }
      await WorkspaceService.createNode(
        parentId,
        { Child: entityType },
        formData.name,
        formData.description ?? '',
      );
      toastSuccess(toast, `${meta.label} Created`, `${formData.name} has been created successfully`);
    } else if (mode === 'edit' && node) {
      await WorkspaceService.updateNode(node.id, {
        name: formData.name,
        description: formData.description,
      });
      toastSuccess(toast, `${meta.label} Updated`, `${formData.name} has been updated successfully`);
    }
  };

  const initialData: { name: string; description: string; } | undefined = node
    ? { name: node.name, description: node.description ?? '' }
    : undefined;

  return (
    <EntityManagementModal
      isOpen={isOpen}
      onClose={onClose}
      mode={mode}
      modes={modes}
      fields={fields}
      initialData={initialData}
      onSubmit={handleSubmit}
      entityName={getEntityTypeString(node?.entity_type ?? { Child: entityType }).toLowerCase()}
    />
  );
}
