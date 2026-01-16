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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import WorkspaceService from "@/lib/workspace-service";
import { useWorkspace } from "@/lib/workspace-context";

interface OfficeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  office?: {
    id: string;
    name: string;
    description?: string;
  };
}

export const OfficeManagementModal: React.FC<OfficeManagementModalProps> = ({
  isOpen,
  onClose,
  mode,
  office,
}) => {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: office?.name || "",
    description: office?.description || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Office name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "create") {
        // Get workspace ID from state
        const workspaceId = state.workspace?.id;
        if (!workspaceId) {
          throw new Error("No workspace ID available");
        }

        await WorkspaceService.createOffice(
          workspaceId,
          formData.name,
          formData.description,
          undefined, // Initial MDX content
          undefined  // Metadata
        );

        toast({
          title: "Office Created",
          description: `${formData.name} has been created successfully`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      } else if (mode === "edit" && office) {
        await WorkspaceService.updateOffice(office.id, {
          name: formData.name,
          description: formData.description,
        });

        toast({
          title: "Office Updated",
          description: `${formData.name} has been updated successfully`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      }

      onClose();
      // Reset form
      setFormData({ name: "", description: "" });
    } catch (error) {
      console.error("Error managing office:", error);
      toast({
        title: "Error",
        description: `Failed to ${mode} office. Please try again.`,
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
      setFormData({ name: "", description: "" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-[#343A5C] border-purple-800">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">
              {mode === "create" ? "Create New Office" : "Edit Office"}
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              {mode === "create"
                ? "Add a new office to your workspace"
                : "Update office information"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-white">
                Office Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Engineering, Marketing, HR"
                className="bg-[#444A6C] border-gray-600 text-white placeholder:text-gray-400"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description" className="text-white">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Describe the purpose of this office..."
                className="bg-[#444A6C] border-gray-600 text-white placeholder:text-gray-400 min-h-[100px]"
                disabled={isSubmitting}
              />
            </div>
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
              className="bg-[#E5DEFF] text-[#343A5C] hover:bg-[#F1F0FB] hover:text-[#262C4A]"
            >
              {isSubmitting
                ? mode === "create"
                  ? "Creating..."
                  : "Updating..."
                : mode === "create"
                ? "Create Office"
                : "Update Office"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};