import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface ExitConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  userName: string;
  workspaceName?: string;
}

export const ExitConfirmModal = ({
  open,
  onOpenChange,
  onConfirm,
  userName,
  workspaceName = "your workspace",
}: ExitConfirmModalProps) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1C1D28] border-gray-800 text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-600">
              <ArrowLeft className="w-6 h-6 text-white" />
            </div>
            <DialogTitle className="text-xl font-semibold text-white">
              Exit Workspace?
            </DialogTitle>
          </div>
          <DialogDescription className="text-gray-400 mt-4">
            Return to the landing page? You'll stay logged in as{" "}
            <span className="font-semibold text-purple-400">{userName}</span>{" "}
            and can access{" "}
            <span className="font-semibold text-purple-400">{workspaceName}</span>{" "}
            anytime from the workspace switcher.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 bg-[#131420] rounded-lg border border-gray-800">
          <p className="text-sm text-gray-300">
            💡 <strong>Tip:</strong> Your session will remain active. Click the
            workspace icon on the landing page to return instantly without
            re-entering your password.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Exit to Landing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
