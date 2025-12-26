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
  maxBackoffSeconds?: number; // Maximum backoff time in seconds (default: 300 = 5 minutes)
}

export const ConnectionRetryModal: React.FC<ConnectionRetryModalProps> = ({
  isOpen,
  onClose,
  errorMessage = "Failed to connect to the workspace server",
  onRetry,
  maxRetries = 10, // Increased for longer server startup times
  maxBackoffSeconds = 300 // 5 minutes max
}) => {
  const userFriendlyError = errorMessage ? getUserFriendlyErrorMessage(errorMessage) : "Unable to connect to the workspace server.";
  const [countdown, setCountdown] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { toast } = useToast();

  // Calculate retry delay based on attempt number (exponential backoff)
  // Starts at 2s, then 4s, 8s, 16s, 32s, 64s, 128s, 256s (capped at maxBackoffSeconds)
  const getRetryDelay = (attempt: number) => {
    const baseDelay = 2000; // Start with 2 seconds
    return Math.min(baseDelay * Math.pow(2, attempt - 1), maxBackoffSeconds * 1000);
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
      }
    }
  );

  // Initialize retry when modal opens
  useEffect(() => {
    if (isOpen && !hasInitialized && attempt === 0) {
      setHasInitialized(true);
      // Start the first connection attempt
      execute();
    }

    // Reset when modal closes
    if (!isOpen && hasInitialized) {
      setHasInitialized(false);
    }
  }, [isOpen, hasInitialized, attempt, execute]);

  // Handle countdown timer for auto-retry
  useEffect(() => {
    // Only start countdown after first attempt fails and we have more retries left
    if (!isOpen || isLoading || attempt === 0 || attempt >= maxRetries) return;

    const retryDelay = getRetryDelay(attempt);
    const startTime = Date.now();
    setCountdown(Math.ceil(retryDelay / 1000));

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remainingSeconds = Math.ceil((retryDelay - elapsed) / 1000);
      setCountdown(Math.max(remainingSeconds, 0));

      if (elapsed >= retryDelay && attempt < maxRetries) {
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
    setCountdown(0);
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
                <span>Attempting to reconnect... (attempt {attempt} of {maxRetries})</span>
              </div>
            ) : attempt >= maxRetries ? (
              <div className="text-destructive">
                Failed to reconnect after {maxRetries} attempts
              </div>
            ) : attempt > 0 ? (
              <div>
                Attempt {attempt} failed. Waiting to retry...
              </div>
            ) : (
              <div>
                Connecting...
              </div>
            )}
          </div>

          {/* Countdown with spinner */}
          {!isLoading && attempt > 0 && attempt < maxRetries && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Next retry in:</span>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                  <span className="font-mono">
                    {countdown >= 60
                      ? `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`
                      : `${countdown}s`
                    }
                  </span>
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