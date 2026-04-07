import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

interface LoginConflictModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceCount: number;
  onDismiss: () => void;
}

export const LoginConflictModal = ({
  open,
  onOpenChange,
  workspaceCount,
  onDismiss,
}: LoginConflictModalProps) => {
  const handleDismiss = () => {
    onDismiss();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1C1D28] border-gray-800 text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-600">
              <Info className="w-6 h-6 text-white" />
            </div>
            <DialogTitle className="text-xl font-semibold text-white">
              Already Logged In
            </DialogTitle>
          </div>
          <DialogDescription className="text-gray-400 mt-4">
            You're already logged in to{" "}
            <span className="font-semibold text-purple-400">
              {workspaceCount === 1
                ? "a workspace"
                : `${workspaceCount} workspaces`}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 bg-[#131420] rounded-lg border border-gray-800">
          <p className="text-sm text-gray-300">
            Use the workspace icons at the top of the page to access your
            active sessions, or disconnect from them before logging in with a
            different account.
          </p>
        </div>

        <DialogFooter>
          <Button
            onClick={handleDismiss}
            className="bg-purple-600 hover:bg-purple-700 text-white w-full"
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
