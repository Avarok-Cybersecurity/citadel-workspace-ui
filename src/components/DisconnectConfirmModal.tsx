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
import { Loader2 } from "lucide-react";
import type { ActiveSession } from "@/types/session-types";

interface DisconnectConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ActiveSession | null;
  workspaceName: string | null;
  onConfirm: () => void;
}

export const DisconnectConfirmModal = ({
  open,
  onOpenChange,
  session,
  workspaceName,
  onConfirm,
}: DisconnectConfirmModalProps) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  if (!session) return null;

  const handleConfirm = async () => {
    setIsDisconnecting(true);
    try {
      await onConfirm();
    } finally {
      setIsDisconnecting(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1C1D28] border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-white">
            Disconnect from Workspace?
          </DialogTitle>
          <DialogDescription className="text-gray-400 mt-2">
            Are you sure you want to disconnect from{" "}
            <span className="font-semibold text-purple-400">
              {workspaceName || session.username}
            </span>
            ?
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 bg-[#252424] rounded-lg border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#6E59A5] text-white font-semibold">
              {session.full_name?.charAt(0).toUpperCase() ||
                session.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-white">
                {session.full_name || session.username}
              </div>
              <div className="text-sm text-gray-400">@{session.username}</div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
            disabled={isDisconnecting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disconnecting...
              </>
            ) : (
              "Disconnect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
