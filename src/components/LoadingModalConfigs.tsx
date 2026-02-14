import { LoadingModal, type LoadingModalConfig } from './LoadingModal';

// Pre-configured modal configs for common use cases

export const DISCONNECT_MODAL_CONFIG: LoadingModalConfig = {
  testId: "disconnect-loading-modal",
  steps: [
    { key: "disconnecting", label: "Disconnecting Session", shortLabel: "Disconnect" },
    { key: "cleaning", label: "Cleaning Up", shortLabel: "Cleanup" },
  ],
  titles: {
    disconnecting: "Disconnecting Session",
    cleaning: "Cleaning Up",
    ready: "Session Disconnected",
    error: "Disconnect Failed",
  },
  descriptions: {
    disconnecting: "Closing connection to the server...",
    cleaning: "Finalizing session cleanup...",
    ready: "You can now safely reconnect or log in with another account.",
    error: "An error occurred while disconnecting.",
  },
  successMessage: "Safe to reconnect",
  autoCloseDelay: 1500,
};

export const CONNECT_MODAL_CONFIG: LoadingModalConfig = {
  testId: "connect-loading-modal",
  steps: [
    { key: "connecting", label: "Connecting", shortLabel: "Connect" },
    { key: "authenticating", label: "Authenticating", shortLabel: "Auth" },
    { key: "loading", label: "Loading Workspace", shortLabel: "Load" },
  ],
  titles: {
    connecting: "Connecting",
    authenticating: "Authenticating",
    loading: "Loading Workspace",
    ready: "Connected!",
    error: "Connection Failed",
  },
  descriptions: {
    connecting: "Establishing secure connection to the server...",
    authenticating: "Verifying your credentials...",
    loading: "Fetching your workspace data...",
    ready: "Welcome back! Redirecting to your workspace...",
    error: "Unable to connect. Please try again.",
  },
  successMessage: "Entering workspace",
  autoCloseDelay: 1000,
};

// Convenience wrapper components

export type DisconnectStatus = "disconnecting" | "cleaning" | "ready" | "error";

interface DisconnectLoadingModalProps {
  open: boolean;
  status: DisconnectStatus;
  workspaceName: string;
  errorMessage?: string;
  onComplete?: () => void;
}

export const DisconnectLoadingModal = ({
  open,
  status,
  workspaceName,
  errorMessage,
  onComplete,
}: DisconnectLoadingModalProps) => (
  <LoadingModal
    open={open}
    status={status}
    displayName={workspaceName}
    errorMessage={errorMessage}
    onComplete={onComplete}
    config={DISCONNECT_MODAL_CONFIG}
  />
);

export type ConnectStatus = "connecting" | "authenticating" | "loading" | "ready" | "error";

interface ConnectLoadingModalProps {
  open: boolean;
  status: ConnectStatus;
  username?: string;
  errorMessage?: string;
  onComplete?: () => void;
}

export const ConnectLoadingModal = ({
  open,
  status,
  username,
  errorMessage,
  onComplete,
}: ConnectLoadingModalProps) => (
  <LoadingModal
    open={open}
    status={status}
    displayName={username}
    errorMessage={errorMessage}
    onComplete={onComplete}
    config={CONNECT_MODAL_CONFIG}
  />
);
