import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { validateUsername, validatePassword, validateFullName } from "@/lib/credential-rules";
import { useQueryClient } from "@tanstack/react-query";
import type { SecuritySettingsValues } from "./SecuritySettings";
import { websocketService } from "@/lib/websocket-service";
import { eventEmitter } from "@/lib/event-emitter";
import { ConnectionManager } from "@/lib/connection";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { mapSecuritySettings } from "@/lib/security-utils";
import type { ConnectStatus } from "./LoadingModal";
import { debugLog } from '@/lib/debug-config';
import { createRegistrationResponseHandler } from './registration-response-handler';

interface JoinFormData {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export function useJoinRegistration(onBack: () => void, serverAddress: string, serverPassword: string) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRegistering, setIsRegistering] = useState(false);
  const [showNotInitializedModal, setShowNotInitializedModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("connecting");

  const [formData, setFormData] = useState<JoinFormData>({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched((prev) => ({ ...prev, [e.target.name]: true }));
  };

  // The SDK enforces these server-side and rejects the whole registration with
  // a generic toast. Checking here means the user learns that a password has a
  // 17-character maximum while typing it, not after a round-trip.
  const rawErrors = {
    fullName: validateFullName(formData.fullName),
    username: validateUsername(formData.username),
    password: validatePassword(formData.password),
    confirmPassword:
      formData.confirmPassword && formData.password !== formData.confirmPassword
        ? "The passwords you entered do not match"
        : null,
  };

  // Surface an error only once the field has been left or a submit attempted.
  // Telling someone their 1-character username is too short while they are
  // still typing it is noise, not help.
  const visible = (field: keyof typeof rawErrors) =>
    touched[field] || submitAttempted ? rawErrors[field] : null;

  const fieldErrors = {
    fullName: visible("fullName"),
    username: visible("username"),
    password: visible("password"),
    confirmPassword: visible("confirmPassword"),
  };

  const securitySettings = queryClient.getQueryData<SecuritySettingsValues>(['securitySettings']) || {
    securityLevel: 'Standard',
    secrecyMode: 'BestEffort',
    encryptionAlgorithm: 'AES_GCM_256',
    kemAlgorithm: 'MlKem',
    sigAlgorithm: 'None',
    headerObfuscatorSettings: {},
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleConnectSuccess = async (
    data: Record<string, unknown>,
    resolve: (value: { cid: string }) => void,
    reject: (reason: Error) => void
  ) => {
    debugLog('Join', 'ConnectSuccess CID:', (data.cid as bigint | undefined)?.toString());
    try {
      await ConnectionManager.getInstance().handleAuthSuccess({
        username: formData.username, password: formData.password,
        fullName: formData.fullName, serverAddress: serverAddress,
        serverPassword: serverPassword || "",
        securitySettings: mapSecuritySettings(securitySettings),
        cid: data.cid as bigint
      });
      resolve({ cid: String(data.cid) });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitAttempted(true);

    if (!formData.fullName || !formData.username || !formData.password || !formData.confirmPassword) {
      toast({ title: "Missing Fields", description: "Please fill out all fields to continue", variant: "destructive" });
      return;
    }

    // Report the first rule the form breaks rather than letting the server
    // reject it. The inline errors are already rendered by this point; the
    // toast exists for the case where the offending field is scrolled away.
    const firstError =
      rawErrors.fullName ?? rawErrors.username ?? rawErrors.password ?? rawErrors.confirmPassword;
    if (firstError) {
      toast({ title: "Check your details", description: firstError, variant: "destructive" });
      return;
    }

    setIsRegistering(true);
    setShowConnectModal(true);
    setConnectStatus("connecting");

    try {
      debugLog('Join', "Registering user:", formData.username, "to", serverAddress);
      const requestId = crypto.randomUUID();

      const responsePromise = new Promise<{ cid: string }>((resolve, reject) => {
        let handler: ((raw: unknown) => void) | null = null;

        const timeout = setTimeout(() => {
          if (handler) eventEmitter.off('websocket-message', handler);
          reject(new Error('Registration timed out after 30 seconds'));
        }, 30000);

        const cleanup = () => {
          clearTimeout(timeout);
          if (handler) eventEmitter.off('websocket-message', handler);
        };

        handler = createRegistrationResponseHandler(requestId, resolve, reject, cleanup, {
          handleConnectSuccess,
          setShowNotInitializedModal,
        });
        eventEmitter.on('websocket-message', handler);
        debugLog('Join', 'Join: Event listener registered');
      });

      await websocketService.register(
        requestId, formData.username, formData.password, formData.fullName,
        serverAddress, serverPassword || "",
        mapSecuritySettings(securitySettings)
      );

      debugLog('Join', 'Registration request sent with ID:', requestId);
      setConnectStatus("authenticating");

      const response = await responsePromise;
      setConnectStatus("loading");
      debugLog('Join', "Register Response:", response);

      toast({ title: "Registration Successful", description: "Your account has been registered. Connecting to workspace...", variant: "default" });
      setConnectStatus("ready");
    } catch (error: unknown) {
      debugLog('Join', 'Registration Error:', error);
      setShowConnectModal(false);
      const errorArg = error instanceof Error ? error : String(error);
      toast({ title: getErrorTitle(errorArg), description: getUserFriendlyErrorMessage(errorArg), variant: "destructive" });
    } finally {
      debugLog('Join', "Setting isRegistering to false in finally block.");
      setIsRegistering(false);
    }
  };

  const handleConnectModalComplete = () => {
    setShowConnectModal(false);
    navigate(getWorkspacePath());
  };

  const handleReturnToLogin = () => {
    setShowNotInitializedModal(false);
    onBack();
  };

  return {
    formData,
    isRegistering,
    showNotInitializedModal,
    showConnectModal,
    connectStatus,
    handleInputChange,
    handleBlur,
    fieldErrors,
    handleSubmit,
    handleConnectModalComplete,
    handleReturnToLogin,
  };
}
