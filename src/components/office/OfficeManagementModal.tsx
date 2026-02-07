import { useToast } from "@/hooks/use-toast";
import { toastSuccess } from "@/lib/toast-helpers";
import WorkspaceService from "@/lib/workspace-service";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  EntityManagementModal,
  type FieldConfig,
  type ModeConfig,
} from '@/components/shared/EntityManagementModal';

interface OfficeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  office?: { id: string; name: string; description?: string };
}

const MODES: Record<"create" | "edit", ModeConfig> = {
  create: {
    title: "Create New Office",
    description: "Add a new office to your workspace",
    submitLabel: "Create Office",
    submittingLabel: "Creating...",
  },
  edit: {
    title: "Edit Office",
    description: "Update office information",
    submitLabel: "Update Office",
    submittingLabel: "Updating...",
  },
};

const FIELDS: FieldConfig[] = [
  { id: 'name', label: 'Office Name', type: 'input', placeholder: 'e.g., Engineering, Marketing, HR', required: true },
  { id: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the purpose of this office...' },
];

export const OfficeManagementModal: React.FC<OfficeManagementModalProps> = ({
  isOpen, onClose, mode, office,
}) => {
  const { state } = useWorkspace();
  const { toast } = useToast();

  const handleSubmit = async (formData: Record<string, string>) => {
    if (mode === "create") {
      const workspaceId = state.workspace?.id;
      if (!workspaceId) throw new Error("No workspace ID available");
      await WorkspaceService.createOffice(workspaceId, formData.name, formData.description);
      toastSuccess(toast, "Office Created", `${formData.name} has been created successfully`);
    } else if (mode === "edit" && office) {
      await WorkspaceService.updateOffice(office.id, { name: formData.name, description: formData.description });
      toastSuccess(toast, "Office Updated", `${formData.name} has been updated successfully`);
    }
  };

  return (
    <EntityManagementModal
      isOpen={isOpen}
      onClose={onClose}
      mode={mode}
      modes={MODES}
      fields={FIELDS}
      initialData={office ? { name: office.name, description: office.description ?? '' } : undefined}
      onSubmit={handleSubmit}
      entityName="office"
    />
  );
};
