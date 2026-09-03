import { useToast } from "@/hooks/use-toast";
import { toastSuccess } from "@/lib/toast-helpers";
import WorkspaceService from "@/lib/workspace-service";
import { UserRoleTS } from "@/types/workspace-protocol";
import {
  EntityManagementModal,
  type FieldConfig,
  type ModeConfig,
} from '@/components/shared/EntityManagementModal';

interface MemberManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "add" | "edit" | "remove";
  domainId?: string;
  member?: { id: string; username: string; role: string };
}

const ROLE_OPTIONS: { value: string; label: string; }[] = [
  { value: "Owner", label: "Owner" },
  { value: "Admin", label: "Admin" },
  { value: "Member", label: "Member" },
  { value: "Guest", label: "Guest" },
];

const BASE_MODES: Record<"add" | "edit" | "remove", ModeConfig> = {
  add: {
    title: "Add New Member",
    description: "",
    submitLabel: "Add Member",
    submittingLabel: "Adding...",
  },
  edit: {
    title: "Edit Member Role",
    description: "",
    submitLabel: "Update Role",
    submittingLabel: "Updating...",
  },
  remove: {
    title: "Remove Member",
    description: "",
    submitLabel: "Remove Member",
    submittingLabel: "Removing...",
    submitVariant: "destructive",
  },
};

const FIELDS: FieldConfig[] = [
  { id: 'username', label: 'Username', type: 'input', placeholder: 'Enter username', required: true, showInModes: ['add'] },
  { id: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, defaultValue: 'Member', showInModes: ['add', 'edit'] },
];

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({
  isOpen, onClose, mode, domainId, member,
}) => {
  const { toast } = useToast();
  const location: "domain" | "workspace" = domainId ? "domain" : "workspace";

  const modes: Record<"add" | "edit" | "remove", ModeConfig> = {
    add: { ...BASE_MODES.add, description: `Add a new member to this ${location}` },
    edit: { ...BASE_MODES.edit, description: `Update member's role in this ${location}` },
    remove: { ...BASE_MODES.remove, description: `Remove member from this ${location}` },
  };

  const handleSubmit = async (formData: Record<string, string>): Promise<void> => {
    if (mode === "add") {
      await WorkspaceService.addMember(formData.username, formData.role as UserRoleTS, domainId);
      toastSuccess(toast, "Member Added", `${formData.username} has been added to the ${location} as ${formData.role}`);
    } else if (mode === "edit" && member) {
      await WorkspaceService.updateMemberRole(member.id, formData.role);
      toastSuccess(toast, "Member Updated", `${member.username}'s role has been updated to ${formData.role}`);
    } else if (mode === "remove" && member) {
      await WorkspaceService.removeMember(member.id, domainId);
      toastSuccess(toast, "Member Removed", `${member.username} has been removed`);
    }
  };

  const customContent: JSX.Element | undefined = mode === "remove" && member ? (
    <div className="text-foreground">
      Are you sure you want to remove <strong>{member.username}</strong> from this {location}?
    </div>
  ) : undefined;

  return (
    <EntityManagementModal
      isOpen={isOpen}
      onClose={onClose}
      mode={mode}
      modes={modes}
      fields={FIELDS}
      initialData={member ? { username: member.username, role: member.role } : undefined}
      onSubmit={handleSubmit}
      entityName="member"
      customContent={customContent}
    />
  );
};
