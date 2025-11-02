import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import WorkspaceService from "@/lib/workspace-service";
import { useWorkspace } from "@/lib/workspace-context";

interface MemberManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "add" | "edit" | "remove";
  officeId?: string;
  roomId?: string;
  member?: {
    id: string;
    username: string;
    role: string;
  };
}

const roleOptions = [
  { value: "Owner", label: "Owner" },
  { value: "Admin", label: "Admin" },
  { value: "Member", label: "Member" },
  { value: "Guest", label: "Guest" },
];

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({
  isOpen,
  onClose,
  mode,
  officeId,
  roomId,
  member,
}) => {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    username: member?.username || "",
    role: member?.role || "Member",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim() && mode === "add") {
      toast({
        title: "Validation Error",
        description: "Username is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "add") {
        await WorkspaceService.addMember(
          formData.username,
          formData.role,
          officeId,
          roomId
        );

        const location = roomId ? "room" : officeId ? "office" : "workspace";
        toast({
          title: "Member Added",
          description: `${formData.username} has been added to the ${location} as ${formData.role}`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      } else if (mode === "edit" && member) {
        await WorkspaceService.updateMemberRole(
          member.id,
          formData.role
        );

        toast({
          title: "Member Updated",
          description: `${member.username}'s role has been updated to ${formData.role}`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      } else if (mode === "remove" && member) {
        await WorkspaceService.removeMember(
          member.id,
          officeId,
          roomId
        );

        toast({
          title: "Member Removed",
          description: `${member.username} has been removed`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      }

      onClose();
      // Reset form
      setFormData({ username: "", role: "Member" });
    } catch (error) {
      console.error("Error managing member:", error);
      toast({
        title: "Error",
        description: `Failed to ${mode} member. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      // Reset form when closing
      setFormData({ username: "", role: "Member" });
    }
  };

  const getDialogTitle = () => {
    switch (mode) {
      case "add":
        return "Add New Member";
      case "edit":
        return "Edit Member Role";
      case "remove":
        return "Remove Member";
      default:
        return "Member Management";
    }
  };

  const getDialogDescription = () => {
    const location = roomId ? "room" : officeId ? "office" : "workspace";
    switch (mode) {
      case "add":
        return `Add a new member to this ${location}`;
      case "edit":
        return `Update member's role in this ${location}`;
      case "remove":
        return `Remove member from this ${location}`;
      default:
        return "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-[#343A5C] border-purple-800">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">
              {getDialogTitle()}
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              {getDialogDescription()}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {mode === "add" && (
              <div className="grid gap-2">
                <Label htmlFor="username" className="text-white">
                  Username
                </Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, username: e.target.value }))
                  }
                  placeholder="Enter username"
                  className="bg-[#444A6C] border-gray-600 text-white placeholder:text-gray-400"
                  required
                  disabled={isSubmitting}
                />
              </div>
            )}
            
            {(mode === "add" || mode === "edit") && (
              <div className="grid gap-2">
                <Label htmlFor="role" className="text-white">
                  Role
                </Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, role: value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="bg-[#444A6C] border-gray-600 text-white">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#343A5C] border-purple-800">
                    {roleOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-white hover:bg-[#444A6C]"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "remove" && member && (
              <div className="text-white">
                Are you sure you want to remove <strong>{member.username}</strong> from this{" "}
                {roomId ? "room" : officeId ? "office" : "workspace"}?
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="bg-transparent border-gray-600 text-white hover:bg-[#444A6C]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className={mode === "remove" 
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-[#E5DEFF] text-[#343A5C] hover:bg-[#F1F0FB] hover:text-[#262C4A]"
              }
            >
              {isSubmitting
                ? mode === "add"
                  ? "Adding..."
                  : mode === "edit"
                  ? "Updating..."
                  : "Removing..."
                : mode === "add"
                ? "Add Member"
                : mode === "edit"
                ? "Update Role"
                : "Remove Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};