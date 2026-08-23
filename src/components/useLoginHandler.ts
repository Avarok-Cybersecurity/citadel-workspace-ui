import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { websocketService } from "@/lib/websocket-service";
import { connectionManager } from "@/lib/connection";
import { eventEmitter } from "@/lib/event-emitter";
import { isResponseType } from 'citadel-workspace-client-ts';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { getDefaultSecuritySettings } from "@/lib/security-utils";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { setSelectedUser } from "@/lib/tab-context";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { redirectToExistingSession } from './login-session-redirect';
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
  const [server, setServer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettingsState>({
    securityLevel: 'Standard', secrecyMode: 'BestEffort',
    encryptionAlgorithm: 'AES_GCM_256', kemAlgorithm: 'MlKem',
    sigAlgorithm: 'None', headerObfuscatorSettings: {}, storeCredentials: false
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  const doRedirect = (session: { cid: bigint; username: string; server_address: string }) =>
    redirectToExistingSession(session, { navigate, toast, onNext });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError("Username and password are required"); return; }

    setLoading(true);
    setError(null);

    try {
      const activeSessions = await connectionManager.getActiveSessions();
      const existingSession = activeSessions.find(session => session.username === username.trim());
      if (existingSession) {
        debugLog('Login', 'User already has active session, redirecting:', existingSession);
        try {
          await doRedirect({
            cid: existingSession.cid,
            username: existingSession.username ?? username.trim(),
            server_address: existingSession.server_address,
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      const storedSessions = connectionManager.getStoredSessions();
      const storedSession = storedSessions.sessions.find(s => s.username === username.trim());
      const serverAddress = storedSession?.serverAddress || server.trim() || '';

      if (!serverAddress) { debugLog('Login', 'No stored session and no server address provided'); }
      else if (!storedSession) { debugLog('Login', 'Using form server address:', serverAddress); }

      const requestId = crypto.randomUUID();
      let responseReceived = false;
      const responsePromise = new Promise<bigint>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!responseReceived) { eventEmitter.off('websocket-message', handler); reject(new Error('Connection timeout')); }
        }, 30000);

        const handler = (message: InternalServiceResponse) => {
          const response = (message as Record<string, unknown>).Response
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
            const errorMessage = response.ConnectFailure.message || 'Connection failed';
            if (errorMessage.toLowerCase().includes('already connected')) {
              const errorCid = response.ConnectFailure.cid;
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

      await websocketService.connect(requestId, username, password, undefined);
      const cid = await responsePromise;

      await connectionManager.handleAuthSuccess({
        username, password, fullName: username, serverAddress,
        serverPassword: "", securitySettings: getDefaultSecuritySettings(), cid
      });

      await setSelectedUser({ selectedUsername: username.trim(), selectedServerAddress: serverAddress, selectedCid: cid });
      await postAuthSetup(cid);

      try { await wasmConnectionManager.start(cid.toString()); }
      catch (err) { debugLog('Login', 'Failed to start WASM connection manager:', err); }

      eventEmitter.emit('session:activated', {
        cid: cid.toString(), username: username.trim(),
        serverAddress, activationType: 'login',
      });

      onNext(cid.toString());
      toast({ title: "Login successful", description: "Connected to workspace successfully" });
    } catch (err: unknown) {
      const errArg = err instanceof Error ? err : String(err);
      setError(getUserFriendlyErrorMessage(errArg));
      toast({ variant: "destructive", title: getErrorTitle(errArg), description: getUserFriendlyErrorMessage(errArg) });
    } finally {
      setLoading(false);
    }
  };

  return {
    username, setUsername, password, setPassword, server, setServer,
    error, loading, securitySettings, setSecuritySettings, handleLogin,
  };
}
