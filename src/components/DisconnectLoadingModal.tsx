import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export type DisconnectStatus = "disconnecting" | "cleaning" | "ready" | "error";

interface DisconnectLoadingModalProps {
  open: boolean;
  status: DisconnectStatus;
  workspaceName: string;
  errorMessage?: string;
  onComplete?: () => void;
}

const STATUS_CONFIG = {
  disconnecting: {
    icon: Loader2,
    title: "Disconnecting Session",
    description: "Closing connection to the server...",
    iconClass: "animate-spin text-purple-400",
  },
  cleaning: {
    icon: Loader2,
    title: "Cleaning Up",
    description: "Finalizing session cleanup...",
    iconClass: "animate-spin text-purple-400",
  },
  ready: {
    icon: CheckCircle2,
    title: "Session Disconnected",
    description: "You can now safely reconnect or log in with another account.",
    iconClass: "text-green-400",
  },
  error: {
    icon: XCircle,
    title: "Disconnect Failed",
    description: "An error occurred while disconnecting.",
    iconClass: "text-red-400",
  },
};

export const DisconnectLoadingModal = ({
  open,
  status,
  workspaceName,
  errorMessage,
  onComplete,
}: DisconnectLoadingModalProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle mount/unmount animations
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      // Small delay to trigger enter animation
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
      // Wait for exit animation before unmounting
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
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status, open, onComplete]);

  if (!shouldRender) return null;

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      data-testid="disconnect-loading-modal"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Modal Content */}
      <div
        className={`relative z-10 bg-[#1C1D28] border border-gray-700 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl transform transition-all duration-300 ${
          isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            {/* Glow effect for spinner */}
            {(status === "disconnecting" || status === "cleaning") && (
              <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl animate-pulse" />
            )}
            <Icon className={`w-16 h-16 ${config.iconClass} relative z-10`} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-white text-center mb-2">
          {config.title}
        </h2>

        {/* Workspace name */}
        <div className="text-center mb-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-purple-900/30 border border-purple-700/50 rounded-full">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-purple-300 font-medium text-sm">
              {workspaceName}
            </span>
          </span>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-center text-sm">
          {errorMessage || config.description}
        </p>

        {/* Progress indicator */}
        {(status === "disconnecting" || status === "cleaning") && (
          <div className="mt-6">
            <div className="flex justify-center gap-2">
              <div
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  status === "disconnecting" ? "bg-purple-400" : "bg-purple-400/30"
                }`}
              />
              <div
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  status === "cleaning" ? "bg-purple-400" : "bg-purple-400/30"
                }`}
              />
              <div className="w-2 h-2 rounded-full bg-purple-400/30" />
            </div>
            <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
              <span className={status === "disconnecting" ? "text-purple-400" : ""}>
                Disconnect
              </span>
              <span className={status === "cleaning" ? "text-purple-400" : ""}>
                Cleanup
              </span>
              <span>Ready</span>
            </div>
          </div>
        )}

        {/* Success checkmark animation */}
        {status === "ready" && (
          <div className="mt-4 flex justify-center">
            <span className="text-green-400 text-sm font-medium animate-pulse">
              ✓ Safe to reconnect
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
