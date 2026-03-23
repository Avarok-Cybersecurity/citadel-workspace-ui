import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
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
import { narrowWebSocketMessage, hasVariant, getVariant } from '@/lib/ws-message-boundary';

interface JoinFormData {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export function useJoinRegistration(onBack: () => void) {
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

  const serverData = queryClient.getQueryData(['serverConnectForm']) as {
    serverAddress: string;
    password: string
  } || { serverAddress: '', password: '' };

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
        fullName: formData.fullName, serverAddress: serverData.serverAddress,
        serverPassword: serverData.password || "",
        securitySettings: mapSecuritySettings(securitySettings),
        cid: data.cid as bigint
      });
      resolve({ cid: String(data.cid) });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const createResponseHandler = (
    requestId: string,
    resolve: (value: { cid: string }) => void,
    reject: (reason: Error) => void,
    cleanup: () => void
  ) => {
    const matchId = (v: Record<string, unknown>) => v.request_id === requestId;
    const rejectWith = (v: Record<string, unknown>, fallback: string) => {
      cleanup(); reject(new Error((v.message as string) || fallback));
    };
    return (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      debugLog('Join', 'Registration response received, expecting:', requestId);

      const cs = getVariant(message, 'ConnectSuccess');
      if (cs && matchId(cs)) { cleanup(); handleConnectSuccess(cs, resolve, reject).catch(reject); return; }

      const rf = getVariant(message, 'RegisterFailure');
      if (rf && matchId(rf)) { rejectWith(rf, 'Registration failed'); return; }

      const we = getVariant(message, 'WorkspaceError');
      if (we && matchId(we)) {
        cleanup();
        if (we.error === 'WorkspaceNotInitialized') { setShowNotInitializedModal(true); reject(new Error('Workspace not initialized')); }
        else { reject(new Error((we.message as string) || 'Workspace error')); }
        return;
      }

      const ise = getVariant(message, 'InternalServiceError');
      if (ise && matchId(ise)) { rejectWith(ise, 'Internal service error'); return; }

      if (hasVariant(message, 'Response')) {
        const response = getVariant(message, 'Response')!;
        const wcs = response.ConnectSuccess as Record<string, unknown> | undefined;
        if (wcs && matchId(wcs)) { cleanup(); handleConnectSuccess(wcs, resolve, reject).catch(reject); return; }
        const wrf = response.RegisterFailure as Record<string, unknown> | undefined;
        if (wrf && matchId(wrf)) { rejectWith(wrf, 'Registration failed'); return; }
        const wcf = response.ConnectFailure as Record<string, unknown> | undefined;
        if (wcf && matchId(wcf)) { rejectWith(wcf, 'Connection after registration failed'); return; }
      }
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName || !formData.username || !formData.password || !formData.confirmPassword) {
      toast({ title: "Missing Fields", description: "Please fill out all fields to continue", variant: "destructive" });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Password Mismatch", description: "The passwords you entered do not match", variant: "destructive" });
      return;
    }

    setIsRegistering(true);
    setShowConnectModal(true);
    setConnectStatus("connecting");

    try {
      debugLog('Join', "Registering user:", formData.username, "to", serverData.serverAddress);
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

        handler = createResponseHandler(requestId, resolve, reject, cleanup);
        eventEmitter.on('websocket-message', handler);
        debugLog('Join', 'Join: Event listener registered');
      });

      await websocketService.register(
        requestId, formData.username, formData.password, formData.fullName,
        serverData.serverAddress, serverData.password || "",
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
    handleSubmit,
    handleConnectModalComplete,
    handleReturnToLogin,
  };
}
