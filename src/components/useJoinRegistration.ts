import { useState } from "react";
import { firstInvalidField } from './join-first-error';
import { DEFAULT_SECURITY_SETTINGS } from './security-settings-defaults';
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { validateUsername, validatePassword, validateFullName } from "@/lib/credential-rules";
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

export function useJoinRegistration(
  onBack: () => void,
  serverAddress: string,
  serverPassword: string,
  providedSecuritySettings?: SecuritySettingsValues,
) {
  const navigate = useNavigate();
  const { toast } = useToast();
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

  /**
   * Take the user to the field to fix.
   *
   * A refused submit used to leave focus on the Join button: the error was
   * announced and the field was marked `aria-invalid`, and neither of those
   * moves anyone. A screen-reader user hears the message with their cursor on a
   * button; a keyboard user shift-tabs back through the form guessing which
   * field it meant.
   *
   * Which field is a pure decision (`firstInvalidField`); this is the one line
   * that touches the DOM.
   */
  const focusFirstProblem = () => {
    const field = firstInvalidField(
      {
        fullName: formData.fullName,
        username: formData.username,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      },
      rawErrors,
    );
    if (!field) return;
    document.getElementById(field)?.focus();
  };

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

  // Passed in, not read from the query cache.
  //
  // It used to be `queryClient.getQueryData(['securitySettings'])`, and nothing
  // anywhere observes that key — no useQuery for it exists. An unobserved cache
  // entry is garbage-collected after React Query's default five-minute gcTime,
  // so a user who raised their security level and then spent five minutes on
  // the profile step (a password manager, a Back and a Next) registered with
  // the defaults instead, permanently, with nothing said. Landing already
  // lifted the server address out of the cache for exactly this reason and did
  // not carry the fix here.
  const securitySettings = providedSecuritySettings ?? DEFAULT_SECURITY_SETTINGS;

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
        cid: data.cid as bigint,
        storeCredentials: securitySettings.storeCredentials ?? false,
      });
      resolve({ cid: String(data.cid) });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitAttempted(true);

    // Refused submits are reported by the FIELD, not by a toast.
    //
    // Both used to fire: the inline error rendered and was announced, and a
    // destructive toast repeated the same sentence. A screen-reader user heard
    // it twice, and the toast then took focus -- Sonner focuses the toast it
    // mounts -- so the attempt to put the cursor on the offending field lost a
    // race with the thing announcing the problem. Measured: after a mismatched
    // password the active element was the toast's `<li>`.
    //
    // The inline error is already in a live region, already associated with the
    // field through `aria-describedby`, and now the field takes focus. The toast
    // was the third copy of a message that two better channels were carrying.
    const missingField =
      !formData.fullName || !formData.username || !formData.password || !formData.confirmPassword;
    const firstError =
      rawErrors.fullName ?? rawErrors.username ?? rawErrors.password ?? rawErrors.confirmPassword;
    if (missingField || firstError) {
      setSubmitAttempted(true);
      focusFirstProblem();
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
      // No "loading" step: it was set here and replaced two statements later,
      // so the "Fetching your workspace data..." bar described work that had
      // already finished and was visible for a single frame.
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
