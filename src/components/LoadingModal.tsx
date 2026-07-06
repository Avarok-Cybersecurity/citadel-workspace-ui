import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LoadingModalStep {
  key: string;
  label: string;
  shortLabel: string;
}

export interface LoadingModalConfig {
  /** Test ID for the modal (e.g., "disconnect-loading-modal") */
  testId: string;
  /** Steps in the loading process */
  steps: LoadingModalStep[];
  /** Title shown for each status */
  titles: Record<string, string>;
  /** Description shown for each status */
  descriptions: Record<string, string>;
  /** Success message shown when ready */
  successMessage: string;
  /** Auto-close delay in ms after ready (default: 1500) */
  autoCloseDelay?: number;
}

interface LoadingModalProps {
  open: boolean;
  /** Current step key (must match one of config.steps[].key, or "ready" or "error") */
  status: string;
  /** Display name (username, workspace name, etc.) */
  displayName?: string;
  errorMessage?: string;
  onComplete?: () => void;
  /** Called when the user clicks cancel or the operation times out */
  onCancel?: () => void;
  /** Timeout in ms before auto-showing error state (default: 60000) */
  timeoutMs?: number;
  config: LoadingModalConfig;
}

export const LoadingModal = ({
  open,
  status,
  displayName,
  errorMessage,
  onComplete,
  onCancel,
  timeoutMs = 60000,
  config,
}: LoadingModalProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Handle mount/unmount animations
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Auto-close after showing "ready" status
  useEffect(() => {
    if (status === "ready" && open) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, config.autoCloseDelay ?? 1500);
      return () => clearTimeout(timer);
    }
  }, [status, open, onComplete, config.autoCloseDelay]);

  // Timeout: if operation takes too long, show a timed-out state
  useEffect(() => {
    if (!open || status === 'ready' || status === 'error') {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [open, status, timeoutMs]);

  if (!shouldRender) return null;

  const isLoading = status !== "ready" && status !== "error";
  const isError = status === "error";
  const isReady = status === "ready";

  const Icon = isError ? XCircle : isReady ? CheckCircle2 : Loader2;
  const iconClass = isError
    ? "text-red-400"
    : isReady
      ? "text-green-400"
      : "animate-spin text-purple-400";

  const title = config.titles[status] || "Processing...";
  const description = errorMessage || config.descriptions[status] || "";

  // Find current step index for progress indicator
  const currentStepIndex = config.steps.findIndex((step) => step.key === status);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${isVisible ? "opacity-100" : "opacity-0"
        }`}
      data-testid={config.testId}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"
          }`}
      />

      {/* Modal Content */}
      <div
        className={`relative z-10 bg-[#1C1D28] border border-gray-700 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl transform transition-all duration-300 ${isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl animate-pulse" />
            )}
            <Icon className={`w-16 h-16 ${iconClass} relative z-10`} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-white text-center mb-2">
          {title}
        </h2>

        {/* Display name badge */}
        {displayName && (
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-purple-900/30 border border-purple-700/50 rounded-full">
              <div className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-purple-300 font-medium text-sm">
                {displayName}
              </span>
            </span>
          </div>
        )}

        {/* Description */}
        <p className="text-gray-400 text-center text-sm">{description}</p>

        {/* Progress indicator */}
        {isLoading && config.steps.length > 0 && (
          <div className="mt-6">
            <div className="flex justify-center gap-2">
              {config.steps.map((step, index) => (
                <div
                  key={step.key}
                  className={`w-2 h-2 rounded-full transition-colors duration-300 ${index === currentStepIndex
                    ? "bg-purple-400"
                    : "bg-purple-400/30"
                    }`}
                />
              ))}
              <div className="w-2 h-2 rounded-full bg-purple-400/30" />
            </div>
            <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
              {config.steps.map((step, index) => (
                <span
                  key={step.key}
                  className={index === currentStepIndex ? "text-purple-400" : ""}
                >
                  {step.shortLabel}
                </span>
              ))}
              <span>Ready</span>
            </div>
          </div>
        )}

        {/* Success animation */}
        {isReady && (
          <div className="mt-4 flex justify-center">
            <span className="text-green-400 text-sm font-medium animate-pulse">
              {config.successMessage}
            </span>
          </div>
        )}

        {/* Timeout warning */}
        {timedOut && isLoading && (
          <div className="mt-4 text-center text-yellow-400 text-sm">
            This is taking longer than expected.
          </div>
        )}

        {/* Cancel button */}
        {onCancel && (isLoading || isError) && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
              onClick={onCancel}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// Re-export configs and wrappers for backward compatibility
export {
  DISCONNECT_MODAL_CONFIG,
  CONNECT_MODAL_CONFIG,
  DisconnectLoadingModal,
  ConnectLoadingModal,
} from './LoadingModalConfigs';
export type { DisconnectStatus, ConnectStatus } from './LoadingModalConfigs';
