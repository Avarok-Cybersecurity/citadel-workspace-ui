import { useToast } from "@/hooks/use-toast";
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
      toast({ title: "Room Created", description: `${formData.name} has been created successfully`, className: "bg-[#343A5C] border-purple-800 text-purple-200" });
    } else if (mode === "edit" && room) {
      await WorkspaceService.updateRoom(room.id, { name: formData.name, description: formData.description });
      toast({ title: "Room Updated", description: `${formData.name} has been updated successfully`, className: "bg-[#343A5C] border-purple-800 text-purple-200" });
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
