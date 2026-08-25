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
import { Loader2, AlertTriangle } from "lucide-react";
import type { ActiveSession } from "@/types/session-types";

export type DisconnectAction = "disconnect" | "deregister";

interface DisconnectConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ActiveSession | null;
  workspaceName: string | null;
  onConfirm: (action: DisconnectAction) => void;
}

export const DisconnectConfirmModal = ({
  open,
  onOpenChange,
  session,
  workspaceName,
  onConfirm,
}: DisconnectConfirmModalProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedAction, setSelectedAction] = useState<DisconnectAction | null>(null);

  if (!session) return null;

  const handleConfirm = async (action: DisconnectAction) => {
    setIsProcessing(true);
    setSelectedAction(action);
    try {
      await onConfirm(action);
    } finally {
      setIsProcessing(false);
      setSelectedAction(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground">
            Remove Workspace Session?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2">
            Choose how to remove{" "}
            <span className="font-semibold text-primary-accent">
              {workspaceName || session.username}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 bg-input rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary text-primary-foreground font-semibold">
              {session.full_name?.charAt(0).toUpperCase() ||
                session.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-foreground">
                {session.full_name || session.username}
              </div>
              <div className="text-sm text-muted-foreground">@{session.username}</div>
            </div>
          </div>
        </div>

        {/* Deregister warning */}
        <div className="p-3 bg-destructive/10 border border-destructive/25 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm text-destructive">
            <strong>Deregister</strong> permanently removes this account from the server.
            Use this for cleanup between test runs.
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 mt-4">
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Button
              onClick={() => handleConfirm("disconnect")}
              variant="outline"
              className="flex-1 bg-transparent border-warning text-warning hover:bg-warning/15 hover:text-warning/15"
              disabled={isProcessing}
            >
              {isProcessing && selectedAction === "disconnect" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
            <Button
              onClick={() => handleConfirm("deregister")}
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={isProcessing}
            >
              {isProcessing && selectedAction === "deregister" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deregistering...
                </>
              ) : (
                "Deregister"
              )}
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={isProcessing}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
