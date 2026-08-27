/**
 * Translates the internal service's replies to a registration into a settled
 * promise. Extracted from useJoinRegistration so it can be driven directly:
 * inside the hook it was a closure, and the branch that was missing for months
 * could not be tested without rendering the whole join flow.
 */
import { narrowWebSocketMessage, hasVariant, getVariant } from '@/lib/ws-message-boundary';
import { debugLog } from '@/lib/debug-config';

export interface RegistrationHandlerDeps {
  handleConnectSuccess: (
    payload: Record<string, unknown>,
    resolve: (value: { cid: string }) => void,
    reject: (reason: Error) => void
  ) => Promise<void>;
  setShowNotInitializedModal: (show: boolean) => void;
}

export function createRegistrationResponseHandler(
  requestId: string,
  resolve: (value: { cid: string }) => void,
  reject: (reason: Error) => void,
  cleanup: () => void,
  deps: RegistrationHandlerDeps
) {
  const { handleConnectSuccess, setShowNotInitializedModal } = deps;
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

    // With connect_after_register the internal service re-dispatches a Connect
    // under the SAME request_id, so its failure arrives as a TOP-LEVEL
    // ConnectFailure — the sibling of the top-level ConnectSuccess handled
    // above. Only the `Response`-wrapped form was matched, so this fell through
    // to the 30s timeout and reported "Registration timed out" for a
    // registration that had SUCCEEDED. The user then retried and was told the
    // username already exists, for an account they did not know they owned.
    const cf = getVariant(message, 'ConnectFailure');
    if (cf && matchId(cf)) {
      rejectWith(cf, 'Your account was created, but signing in failed. Please try logging in.');
      return;
    }

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
}
