import { useToast } from "@/hooks/use-toast";
import { toastSuccess } from "@/lib/toast-helpers";
import WorkspaceService from "@/lib/workspace-service";
import {
  EntityManagementModal,
  type FieldConfig,
  type ModeConfig,
} from '@/components/shared/EntityManagementModal';

interface RoomManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  officeId: string;
  room?: { id: string; name: string; description?: string };
}

const MODES: Record<"create" | "edit", ModeConfig> = {
  create: {
    title: "Create New Room",
    description: "Add a new room to this office",
    submitLabel: "Create Room",
    submittingLabel: "Creating...",
  },
  edit: {
    title: "Edit Room",
    description: "Update room information",
    submitLabel: "Update Room",
    submittingLabel: "Updating...",
  },
};

const FIELDS: FieldConfig[] = [
  { id: 'name', label: 'Room Name', type: 'input', placeholder: 'e.g., Conference Room, Meeting Room A', required: true },
  { id: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the purpose of this room...' },
];

export const RoomManagementModal: React.FC<RoomManagementModalProps> = ({
  isOpen, onClose, mode, officeId, room,
}) => {
  const { toast } = useToast();

  const handleSubmit = async (formData: Record<string, string>) => {
    if (mode === "create") {
      await WorkspaceService.createRoom(officeId, formData.name, formData.description);
      toastSuccess(toast, "Room Created", `${formData.name} has been created successfully`);
    } else if (mode === "edit" && room) {
      await WorkspaceService.updateRoom(room.id, { name: formData.name, description: formData.description });
      toastSuccess(toast, "Room Updated", `${formData.name} has been updated successfully`);
    }
  };

  return (
    <EntityManagementModal
      isOpen={isOpen}
      onClose={onClose}
      mode={mode}
      modes={MODES}
      fields={FIELDS}
      initialData={room ? { name: room.name, description: room.description ?? '' } : undefined}
      onSubmit={handleSubmit}
      entityName="room"
    />
  );
};
