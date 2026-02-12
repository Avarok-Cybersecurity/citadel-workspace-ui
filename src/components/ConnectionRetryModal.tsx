import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { useRetry, useEventListener } from "@/hooks";
import { websocketService } from "@/lib/websocket-service";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage } from "@/lib/error-messages";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

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

  // Use ref to store retry function to prevent useEffect re-triggering
  // when the retry callback reference changes (which happens on every state update)
  const retryFnRef = useRef<(() => Promise<void>) | null>(null);

  // Track if a retry is currently in progress to prevent overlapping retries
  const retryInProgressRef = useRef(false);

  // Use ref to store execute function to prevent useEffect re-triggering
  // when the execute callback reference changes (which happens on every state update)
  const executeFnRef = useRef<(() => Promise<void>) | null>(null);

  // Memoize the retry operation to prevent reference changes on every render
  // This stabilizes the execute/retry functions from useRetry
  const retryOperation = useCallback(async () => {
    if (onRetry) {
      return onRetry();
    }
    // Default retry logic - reset state and attempt to reconnect
    // Reset clears global WASM state to allow fresh initialization
    websocketService.reset();
    await websocketService.init();
    return true;
  }, [onRetry]);

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
    retryOperation,
    {
      maxRetries,
      // Set to 0 - the modal handles exponential backoff via countdown timer
      // useRetry's delay would cause double-waiting (countdown + delay)
      retryDelay: 0,
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
        debugLog('ConnectionRetryModal', `Retry attempt ${attemptNum} of ${maxRetries}`);
      }
    }
  );

  // Keep the function refs up to date
  useEffect(() => {
    retryFnRef.current = retryConnection;
    executeFnRef.current = execute;
  }, [retryConnection, execute]);

  // Initialize retry when modal opens
  useEffect(() => {
    if (isOpen && !hasInitialized && attempt === 0) {
      setHasInitialized(true);
      // Start the first connection attempt using ref to avoid dependency on changing callback
      if (executeFnRef.current) {
        runAsyncSetup(() => executeFnRef.current!());
      }
    }

    // Reset when modal closes
    if (!isOpen && hasInitialized) {
      setHasInitialized(false);
    }
    // NOTE: Intentionally NOT including execute in deps to prevent infinite re-triggering.
    // The executeFnRef.current always has the latest execute function.
  }, [isOpen, hasInitialized, attempt]);

  // Handle countdown timer for auto-retry
  useEffect(() => {
    // Only start countdown after first attempt fails and we have more retries left
    if (!isOpen || isLoading || attempt === 0 || attempt >= maxRetries) return;

    const retryDelay = getRetryDelay(attempt);
    const startTime = Date.now();
    setCountdown(Math.ceil(retryDelay / 1000));

    // Flag to track if this effect triggered a retry (prevents double-trigger)
    let hasTriggeredRetry = false;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remainingSeconds = Math.ceil((retryDelay - elapsed) / 1000);
      setCountdown(Math.max(remainingSeconds, 0));

      // Trigger retry only once per effect cycle and if no retry is in progress
      if (elapsed >= retryDelay && attempt < maxRetries && !hasTriggeredRetry && !retryInProgressRef.current) {
        hasTriggeredRetry = true;
        retryInProgressRef.current = true;

        // Use the ref to call retry (avoids dependency on changing callback reference)
        if (retryFnRef.current) {
          runAsyncSetup(async () => {
            try {
              await retryFnRef.current!();
            } finally {
              retryInProgressRef.current = false;
            }
          });
        }
      }
    };

    const interval = setInterval(updateProgress, 100);

    return () => clearInterval(interval);
    // NOTE: Intentionally NOT including retryConnection in deps to prevent infinite re-triggering
    // The retryFnRef.current always has the latest retry function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, attempt, maxRetries, isLoading]);

  // Listen for successful connection events
  useEventListener('connection-success', () => {
    onClose();
  }, [onClose]);

  const handleManualRetry = () => {
    setCountdown(0);
    // Use ref for consistency with auto-retry path to avoid race conditions
    if (retryFnRef.current && !retryInProgressRef.current) {
      retryInProgressRef.current = true;
      runAsyncSetup(async () => {
        try {
          await retryFnRef.current!();
        } finally {
          retryInProgressRef.current = false;
        }
      });
    }
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