import { useState } from "react";
import { firstFieldToFix } from '@/lib/first-field-to-fix';

/** The login form's fields, in the order they are rendered. */
const LOGIN_FIELD_ORDER = ['username', 'password'] as const;
type LoginField = (typeof LOGIN_FIELD_ORDER)[number];
import { DEFAULT_SECURITY_SETTINGS } from './security-settings-defaults';
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { websocketService } from "@/lib/websocket-service";
import { connectionManager } from "@/lib/connection";
import { eventEmitter } from "@/lib/event-emitter";
import { isResponseType } from 'citadel-workspace-client-ts';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { startMessagingForSession } from "@/lib/start-messaging";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { setSelectedUser } from "@/lib/tab-context";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { redirectToExistingSession } from './login-session-redirect';
import { mapSecuritySettings } from '@/lib/security-utils';
import type {
  SecurityLevel, SecrecyMode, EncryptionAlgorithm, KemAlgorithm, SigAlgorithm,
} from "@/types";

export interface SecuritySettingsState {
  securityLevel: SecurityLevel;
  secrecyMode: SecrecyMode;
  encryptionAlgorithm: EncryptionAlgorithm;
  kemAlgorithm: KemAlgorithm;
  sigAlgorithm: SigAlgorithm;
  headerObfuscatorSettings: Record<string, string>;
  storeCredentials: boolean;
}

interface UseLoginHandlerParams {
  onNext: (connectionId: string) => void;
}

export function useLoginHandler({ onNext }: UseLoginHandlerParams) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Registration still needs one; signing in does not. Kept so the hook's
  // shape is unchanged for the join flow that shares it.
  const [server, setServer] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The field a refused submit pointed at, so the form can mark it invalid. */
  const [invalidField, setInvalidField] = useState<LoginField | null>(null);
  const [loading, setLoading] = useState(false);
  const [securitySettings, setSecuritySettings] =
    useState<SecuritySettingsState>(DEFAULT_SECURITY_SETTINGS);

  const { toast } = useToast();
  const navigate = useNavigate();

  const doRedirect = (session: { cid: bigint; username: string; server_address: string }): Promise<void> =>
    redirectToExistingSession(session, { navigate, toast, onNext });

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      // And take them to the field, which announcing alone does not.
      //
      // This said the sentence and left focus on Sign In with no field marked
      // invalid: a screen-reader user hears "username and password are
      // required" with their cursor on a button, and there is nothing to say
      // which of the two is missing. The join form was given this in round 230
      // and the login form was not -- the same fix, in one of the two places it
      // belonged.
      const field = firstFieldToFix(LOGIN_FIELD_ORDER, { username, password });
      setInvalidField(field);
      if (field) document.getElementById(field)?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    setInvalidField(null);

    try {
      // No pre-emptive claim on a username match.
      //
      // This used to look up the active sessions, match on username ALONE, and
      // redirect straight into the session -- so the password box on the login
      // form was never read whenever a session for that username was already
      // active on this agent. Typing any password, or the wrong one, signed you
      // in. `getActiveSessions` is agent-wide, so the username did not even have
      // to be one this browser had ever signed in as.
      //
      // The legitimate case it was short-circuiting is still handled, one step
      // later and by the right party: Connect goes to the server with the
      // credentials, and if a session is already live the server answers
      // SessionAlreadyActive, which the handler below turns into the same
      // redirect. Whether the password is correct stops being a question this
      // component answers.
      //
      // NOTE, recorded rather than implied: the internal service's own reuse
      // branch does not verify the password either (see docs/ROBUSTNESS.md).
      // Removing this does not by itself close that hole -- it removes the
      // frontend's independent copy of it, and puts the decision where it can
      // actually be made.

      // Metadata only. `connect` takes no server address -- the SDK pinned the
      // account's server in its CNAC at registration and dials that -- so this
      // exists to label the stored session, not to reach anything. The login
      // form no longer asks for it, because a field that cannot change where
      // you connect should not look like it can.
      const storedSessions = connectionManager.getStoredSessions();
      const storedSession = storedSessions.sessions.find(s => s.username === username.trim());
      const serverAddress: string = storedSession?.serverAddress ?? '';

      const requestId = crypto.randomUUID();
      let responseReceived: boolean = false;
      const responsePromise: Promise<bigint> = new Promise<bigint>((resolve, reject) => {
        const timeout: NodeJS.Timeout = setTimeout((): void => {
          if (!responseReceived) { eventEmitter.off('websocket-message', handler); reject(new Error('Connection timeout')); }
        }, 30000);

        const handler = (message: InternalServiceResponse): void => {
          const response: InternalServiceResponse = (message as Record<string, unknown>).Response
            ? ((message as Record<string, unknown>).Response as InternalServiceResponse) : message;

          if (isResponseType(response, 'ConnectSuccess') && response.ConnectSuccess.request_id === requestId) {
            responseReceived = true; clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler); resolve(response.ConnectSuccess.cid);
          } else if (isResponseType(response, 'SessionAlreadyActive') && response.SessionAlreadyActive.request_id === requestId) {
            responseReceived = true; clearTimeout(timeout); eventEmitter.off('websocket-message', handler);
            const { cid, username: sUser, message: msg } = response.SessionAlreadyActive;
            debugLog('Login', `SessionAlreadyActive - ${msg}`);
            runAsyncSetup(async () => {
              try { await doRedirect({ cid: cid as bigint, username: sUser || username.trim(), server_address: serverAddress }); }
              finally { setLoading(false); }
            });
          } else if (isResponseType(response, 'ConnectFailure') && response.ConnectFailure.request_id === requestId) {
            responseReceived = true; clearTimeout(timeout); eventEmitter.off('websocket-message', handler);
            const errorMessage: string = response.ConnectFailure.message || 'Connection failed';
            if (errorMessage.toLowerCase().includes('already connected')) {
              const errorCid: bigint = response.ConnectFailure.cid;
              if (errorCid && errorCid !== 0n && errorCid !== BigInt(0)) {
                runAsyncSetup(async () => {
                  try { await doRedirect({ cid: errorCid as bigint, username: username.trim(), server_address: serverAddress }); }
                  finally { setLoading(false); }
                });
              } else {
                runAsyncSetup(async () => {
                  try {
                    const sessions = await connectionManager.getActiveSessions();
                    const match = sessions.find(s => s.username === username.trim());
                    if (match?.cid !== undefined) {
                      try { await doRedirect({ cid: match.cid, username: match.username ?? username.trim(), server_address: match.server_address }); }
                      finally { setLoading(false); }
                    } else { setLoading(false); reject(new Error(errorMessage)); }
                  } catch { setLoading(false); reject(new Error(errorMessage)); }
                });
              }
              return;
            }
            reject(new Error(errorMessage));
          }
        };
        eventEmitter.on('websocket-message', handler);
      });

      // The settings the user actually chose, not the defaults.
      //
      // This passed `undefined`, and `auth-operations` fills that gap with
      // `getDefaultSecuritySettings()` — so every choice made in the Security
      // Settings dialog reached this hook's state and died there. A user who
      // selected a higher security level, a post-quantum KEM and a signature
      // algorithm connected with Standard/BestEffort/AES_GCM_256 and was told
      // nothing. The registration flow has always mapped these correctly; the
      // login flow read neither its own state nor the shared cache.
      const chosenSettings = mapSecuritySettings(securitySettings);
      await websocketService.connect(requestId, username, password, chosenSettings);
      const cid: bigint = await responsePromise;

      await connectionManager.handleAuthSuccess({
        username, password, fullName: username, serverAddress,
        // Stored as chosen too. Persisting the defaults here meant every
        // reconnect silently downgraded to them as well, so the choice was lost
        // for the life of the session, not just the first connect.
        serverPassword: "", securitySettings: chosenSettings, cid,
        // The switch the user actually toggled. It reached this hook's state and
        // went no further, so the password was stored either way.
        storeCredentials: securitySettings.storeCredentials,
      });

      await setSelectedUser({ selectedUsername: username.trim(), selectedServerAddress: serverAddress, selectedCid: cid });
      await postAuthSetup(cid);

      const messagingReady: boolean = await startMessagingForSession(cid.toString());

      eventEmitter.emit('session:activated', {
        cid: cid.toString(), username: username.trim(),
        serverAddress, activationType: 'login',
      });

      onNext(cid.toString());
      // Not an unconditional "Connected to workspace successfully". The ILM
      // messenger can fail to start while everything else succeeds, and this
      // toast used to announce success over it -- the user was told they were
      // connected and then found that nothing they sent arrived.
      toast(
        messagingReady
          ? { title: 'Login successful', description: 'Connected to workspace successfully' }
          : {
              variant: 'destructive',
              title: 'Signed in, but messaging is unavailable',
              description: 'Your workspace loaded. Messages cannot be sent or received until you reload.',
            },
      );
    } catch (err: unknown) {
      const errArg: string | Error = err instanceof Error ? err : String(err);
      setError(getUserFriendlyErrorMessage(errArg));
      toast({ variant: "destructive", title: getErrorTitle(errArg), description: getUserFriendlyErrorMessage(errArg) });
    } finally {
      setLoading(false);
    }
  };

  return {
    username, setUsername, password, setPassword, server, setServer,
    error, loading, securitySettings, setSecuritySettings, handleLogin, invalidField,
  };
}
