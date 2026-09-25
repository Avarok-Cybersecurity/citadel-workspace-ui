import { useToast } from "@/hooks/use-toast";
import { toastSuccess } from "@/lib/toast-helpers";
import WorkspaceService from "@/lib/workspace-service";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { UserRoleTS } from "@/types/workspace-protocol";
import { describeFailure } from "@/lib/failure-message";
import { describeRefusal } from "@/lib/workspace-response-handler/describe-error";
import { useGrantableRoles, type RoleOption } from "./use-grantable-roles";
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

const ROLE_OPTIONS: readonly RoleOption[] = [
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

function fieldsFor(roleOptions: RoleOption[]): FieldConfig[] {
  return [
    { id: 'username', label: 'Username', type: 'input', placeholder: 'Enter username', required: true, showInModes: ['add'] },
    { id: 'role', label: 'Role', type: 'select', options: roleOptions, defaultValue: 'Member', showInModes: ['add', 'edit'] },
  ];
}

/** The server's refusal, in words the person who pressed the button can act on. */
async function inPlainWords(write: Promise<unknown>): Promise<void> {
  try {
    await write;
  } catch (error) {
    throw new Error(describeRefusal(describeFailure(error, 'The server did not accept the change.')));
  }
}

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({
  isOpen, onClose, mode, domainId, member,
}) => {
  const { toast } = useToast();
  const roleOptions: RoleOption[] = useGrantableRoles(ROLE_OPTIONS, isOpen && mode !== "remove");
  const { state } = useWorkspace();
  // The place by its name. This said "the domain", the protocol's word, to people who
  // see "Engineering" in the sidebar (measured live).
  const place: string = domainId ? (state.nodes[domainId]?.name ?? "this space") : "the workspace";

  const modes: Record<"add" | "edit" | "remove", ModeConfig> = {
    add: { ...BASE_MODES.add, description: `Add a new member to ${place}` },
    edit: { ...BASE_MODES.edit, description: `Update a member's role in ${place}` },
    remove: { ...BASE_MODES.remove, description: `Remove a member from ${place}` },
  };

  const handleSubmit = async (formData: Record<string, string>): Promise<void> => {
    if (mode === "add") {
      await inPlainWords(WorkspaceService.addMember(formData.username, formData.role as UserRoleTS, domainId));
      toastSuccess(toast, "Member Added", `${formData.username} has been added to ${place} as ${formData.role}`);
    } else if (mode === "edit" && member) {
      await inPlainWords(WorkspaceService.updateMemberRole(member.id, formData.role));
      toastSuccess(toast, "Member Updated", `${member.username}'s role has been updated to ${formData.role}`);
    } else if (mode === "remove" && member) {
      await inPlainWords(WorkspaceService.removeMember(member.id, domainId));
      toastSuccess(toast, "Member Removed", `${member.username} has been removed`);
    }
  };

  const customContent: JSX.Element | undefined = mode === "remove" && member ? (
    <div className="text-foreground">
      Are you sure you want to remove <strong>{member.username}</strong> from {place}?
    </div>
  ) : undefined;

  return (
    <EntityManagementModal
      isOpen={isOpen}
      onClose={onClose}
      mode={mode}
      modes={modes}
      fields={fieldsFor(roleOptions)}
      initialData={member ? { username: member.username, role: member.role } : undefined}
      onSubmit={handleSubmit}
      entityName="member"
      customContent={customContent}
    />
  );
};
