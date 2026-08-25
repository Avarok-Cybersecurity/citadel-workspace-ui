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
import type { ConnectionRetryModalProps } from './connection-retry-types';
import { getRetryDelay } from './connection-retry-types';

export const ConnectionRetryModal: React.FC<ConnectionRetryModalProps> = ({
  isOpen,
  onClose,
  errorMessage = "Failed to connect to the workspace server",
  onRetry,
  maxRetries = 10,
  maxBackoffSeconds = 300
}) => {
  const userFriendlyError = errorMessage ? getUserFriendlyErrorMessage(errorMessage) : "Unable to connect to the workspace server.";
  const [countdown, setCountdown] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { toast } = useToast();

  const retryFnRef = useRef<(() => Promise<unknown>) | null>(null);
  const retryInProgressRef = useRef(false);
  const executeFnRef = useRef<(() => Promise<unknown>) | null>(null);

  const retryOperation = useCallback(async () => {
    if (onRetry) {
      return onRetry();
    }
    websocketService.reset();
    await websocketService.init();
    return true;
  }, [onRetry]);

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
      retryDelay: 0,
      onSuccess: () => {
        toast({
          title: "Connection restored",
          description: "Successfully reconnected to the workspace server"
        });
        onClose();
      },
      onError: (error) => {
        debugLog('ConnectionRetryModal', 'Connection retry failed:', error);
      },
      onRetry: (attemptNum) => {
        debugLog('ConnectionRetryModal', `Retry attempt ${attemptNum} of ${maxRetries}`);
      }
    }
  );

  useEffect(() => {
    retryFnRef.current = retryConnection;
    executeFnRef.current = execute;
  }, [retryConnection, execute]);

  useEffect(() => {
    if (isOpen && !hasInitialized && attempt === 0) {
      setHasInitialized(true);
      const executeFn = executeFnRef.current;
      if (executeFn) {
        runAsyncSetup(() => executeFn());
      }
    }

    if (!isOpen && hasInitialized) {
      setHasInitialized(false);
    }
  }, [isOpen, hasInitialized, attempt]);

  useEffect(() => {
    if (!isOpen || isLoading || attempt === 0 || attempt >= maxRetries) return;

    const retryDelayMs = getRetryDelay(attempt, maxBackoffSeconds);
    const startTime = Date.now();
    setCountdown(Math.ceil(retryDelayMs / 1000));

    let hasTriggeredRetry = false;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remainingSeconds = Math.ceil((retryDelayMs - elapsed) / 1000);
      setCountdown(Math.max(remainingSeconds, 0));

      if (elapsed >= retryDelayMs && attempt < maxRetries && !hasTriggeredRetry && !retryInProgressRef.current) {
        hasTriggeredRetry = true;
        retryInProgressRef.current = true;

        const retryFn = retryFnRef.current;
        if (retryFn) {
          runAsyncSetup(async () => {
            try {
              await retryFn();
            } finally {
              retryInProgressRef.current = false;
            }
          });
        }
      }
    };

    const interval = setInterval(updateProgress, 100);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, attempt, maxRetries, isLoading]);

  useEventListener('connection-success', () => {
    onClose();
  }, [onClose]);

  const handleManualRetry = () => {
    setCountdown(0);
    const retryFn = retryFnRef.current;
    if (retryFn && !retryInProgressRef.current) {
      retryInProgressRef.current = true;
      runAsyncSetup(async () => {
        try {
          await retryFn();
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

          {!isLoading && attempt > 0 && attempt < maxRetries && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Next retry in:</span>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-accent" />
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
