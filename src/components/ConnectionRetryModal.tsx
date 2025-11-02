import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { useRetry } from "@/hooks/use-retry";
import { websocketService } from "@/lib/websocket-service";
import { eventEmitter } from "@/lib/event-emitter";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage } from "@/lib/error-messages";

interface ConnectionRetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string;
  onRetry?: () => Promise<void>;
  maxRetries?: number;
}

export const ConnectionRetryModal: React.FC<ConnectionRetryModalProps> = ({
  isOpen,
  onClose,
  errorMessage = "Failed to connect to the workspace server",
  onRetry,
  maxRetries = 3
}) => {
  const userFriendlyError = errorMessage ? getUserFriendlyErrorMessage(errorMessage) : "Unable to connect to the workspace server.";
  const [countdown, setCountdown] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const { toast } = useToast();

  // Calculate retry delay based on attempt number (exponential backoff)
  const getRetryDelay = (attempt: number) => {
    return Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
  };

  const {
    attempt,
    execute,
    retry: retryConnection,
    isLoading,
    error
  } = useRetry(
    async () => {
      if (onRetry) {
        return onRetry();
      }
      // Default retry logic - attempt to reconnect
      await websocketService.init();
      return true;
    },
    {
      maxRetries,
      retryDelay: 1000,
      onSuccess: () => {
        toast({
          title: "Connection restored",
          description: "Successfully reconnected to the workspace server"
        });
        onClose();
      },
      onError: (error) => {
        console.error("Connection retry failed:", error);
      },
      onRetry: (attemptNum) => {
        console.log(`Retry attempt ${attemptNum} of ${maxRetries}`);
        setIsRetrying(true);
      }
    }
  );

  // Handle countdown timer for auto-retry
  useEffect(() => {
    if (!isOpen || isLoading || attempt >= maxRetries) return;

    const retryDelay = getRetryDelay(attempt + 1);
    let startTime = Date.now();
    setCountdown(Math.ceil(retryDelay / 1000));

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;

      const remainingSeconds = Math.ceil((retryDelay - elapsed) / 1000);
      setCountdown(Math.max(remainingSeconds, 0));

      if (elapsed >= retryDelay && attempt < maxRetries) {
        setIsRetrying(false);
        retryConnection();
      }
    };

    const interval = setInterval(updateProgress, 100);
    
    return () => clearInterval(interval);
  }, [isOpen, attempt, maxRetries, isLoading, retryConnection]);

  // Listen for successful connection events
  useEffect(() => {
    const handleConnectionSuccess = () => {
      onClose();
    };

    const unsubscribe = eventEmitter.on('connection-success', handleConnectionSuccess);
    
    return () => {
      unsubscribe();
    };
  }, [onClose]);

  const handleManualRetry = () => {
    setProgress(0);
    setCountdown(0);
    setIsRetrying(false);
    retryConnection();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Connection Failed
          </DialogTitle>
          <DialogDescription className="pt-2">
            {userFriendlyError}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Retry status */}
          <div className="text-sm text-muted-foreground">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Attempting to reconnect...</span>
              </div>
            ) : attempt >= maxRetries ? (
              <div className="text-destructive">
                Failed to reconnect after {maxRetries} attempts
              </div>
            ) : (
              <div>
                Retry attempt {attempt + 1} of {maxRetries}
              </div>
            )}
          </div>

          {/* Countdown with spinner */}
          {!isLoading && attempt < maxRetries && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Next retry in:</span>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                  <span className="font-mono">{countdown}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Error details */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleManualRetry}
            disabled={isLoading || attempt >= maxRetries}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};