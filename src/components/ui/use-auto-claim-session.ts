/**
 * Claiming an available session on mount, and reporting when it fails.
 *
 * Lifted out of WorkspaceLoader, which was 268 lines of which this was 158.
 * Both `postAuthSetup` awaits in here used to fail into `debugLog` and nothing
 * else -- and debugLog is compiled out of production -- so a new user saw
 * "Connected!", then a spinner, then "Workspace data is taking longer than
 * expected", with no cause and no action. The login path has toasted this
 * since it was written.
 */

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { claimSessionForThisTab, SESSION_OWNED_ELSEWHERE } from '@/lib/sessions/claim-session';
import { pickSessionToClaim } from '@/lib/sessions/pick-session-to-claim';
import { ConnectionManager } from '@/lib/connection';
import { postAuthSetup } from '@/lib/post-auth-setup';
import { setSelectedUser, getSelectedUser, clearSelectedUser } from '@/lib/tab-context';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { describeFailure } from '@/lib/failure-message';
import { TIMEOUT } from '@/lib/timeout-constants';
import type { useToast } from '@/hooks/use-toast';

interface AutoClaimOptions {
  isDevMode: boolean;
  toast: ReturnType<typeof useToast>['toast'];
  setHasConnection: Dispatch<SetStateAction<boolean | null>>;
  setIsAutoClaimingSession: Dispatch<SetStateAction<boolean>>;
  autoClaimAttempted: MutableRefObject<boolean>;
}

export function useAutoClaimSession({
  isDevMode,
  toast,
  setHasConnection,
  setIsAutoClaimingSession,
  autoClaimAttempted,
}: AutoClaimOptions): void {
// Auto-claim an available session on mount if no connection exists
useEffect(() => {
  if (isDevMode) {
    debugLog('WorkspaceLoader', 'Dev mode: Skipping auto-claim');
    return;
  }

  debugLog('WorkspaceLoader', ' Auto-claim useEffect running, attempted:', autoClaimAttempted.current);

  if (autoClaimAttempted.current) {
    debugLog('WorkspaceLoader', ' Skipping auto-claim (already attempted)');
    return;
  }
  autoClaimAttempted.current = true;

  const autoClaimSession = async () => {
    debugLog('WorkspaceLoader', ' Starting auto-claim session process');

    const connectionManager = ConnectionManager.getInstance();

    const currentConnection = connectionManager.getConnectionInfo();
    debugLog('WorkspaceLoader', ' getConnectionInfo() returned:', {
      hasConnection: !!currentConnection,
      cid: currentConnection?.cid?.toString() ?? 'none',
      username: currentConnection?.username ?? 'none',
    });

    if (currentConnection?.cid && currentConnection.cid !== 0n) {
      debugLog('WorkspaceLoader', ' Already connected with CID:', currentConnection.cid);

      const existingSelection = await getSelectedUser();
      if (!existingSelection?.selectedCid) {
        const activeSessions = await connectionManager.getActiveSessions();
        const session = activeSessions.find(s => s.cid === currentConnection.cid);
        if (session) {
          await setSelectedUser({
            selectedUsername: session.username,
            selectedServerAddress: session.server_address,
            selectedCid: session.cid
          });
        }
      }

      // Reported, not swallowed.
      //
      // This await sat outside any try/catch, so a failure here landed in
      // runAsyncSetup's catch -- which does nothing but debugLog, and
      // debugLog is compiled out of production builds. A new user saw
      // "Connected!", then a spinner, then "Workspace data is taking longer
      // than expected" with no cause and no action. The login path has
      // toasted this since it was written; the registration path never did.
      try {
        await postAuthSetup(currentConnection.cid);
      } catch (error) {
        toast({
          title: 'Workspace Setup Failed',
          description: describeFailure(
            error,
            'Your account was created, but the workspace could not be prepared.',
          ),
          variant: 'destructive',
        });
      }

      setHasConnection(true);
      return;
    }

    setIsAutoClaimingSession(true);

    try {
      debugLog('WorkspaceLoader', ' Waiting for ConnectionManager to be ready...');
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('ConnectionManager ready timeout')), TIMEOUT.CLAIM_SESSION_MS)
      );
      await Promise.race([connectionManager.waitForReady(), timeoutPromise]);
      debugLog('WorkspaceLoader', ' ConnectionManager is ready');

      // The result form, because everything below reads an empty list as
      // "you are logged out". A GetSessions timeout used to produce exactly
      // that: the loader concluded there were no sessions, the loading
      // deadline redirected to /connect, and -- worse -- the branch below
      // called clearSelectedUser(), so a failed READ destroyed the tab's
      // session selection. The user re-authenticated a session that was
      // still there, which is the SessionAlreadyActive churn the backend
      // notes warn about.
      const { ok, sessions: activeSessions } = await connectionManager.getActiveSessionsResult();
      debugLog('WorkspaceLoader', ' Found active sessions:', activeSessions.length, 'ok:', ok);

      if (!ok) {
        debugLog('WorkspaceLoader', ' Could not reach the internal service; not concluding anything');
        setIsAutoClaimingSession(false);
        return;
      }

      if (activeSessions.length === 0) {
        debugLog('WorkspaceLoader', ' No active sessions available');
        setIsAutoClaimingSession(false);
        return;
      }

      const existingSelection = await getSelectedUser();
      debugLog('WorkspaceLoader', ' Tab context getSelectedUser() returned:', {
        hasSelection: !!existingSelection,
        selectedCid: existingSelection?.selectedCid?.toString() ?? 'none',
        selectedUsername: existingSelection?.selectedUsername ?? 'none',
      });

      // Reached only when `ok` was true, so an empty list really is empty and
      // clearing the selection is safe.
      const { session: sessionToUse, staleSelection } = pickSessionToClaim(
        activeSessions,
        existingSelection?.selectedCid,
      );
      if (staleSelection) {
        debugLog('WorkspaceLoader', ' Selected session no longer active, trying first available');
        await clearSelectedUser();
      }

      if (!sessionToUse) {
        debugLog('WorkspaceLoader', ' No usable session found');
        setIsAutoClaimingSession(false);
        return;
      }

      const session = sessionToUse;
      debugLog('WorkspaceLoader', ' Auto-claiming session:', session.username, session.cid);

      const outcome = await claimSessionForThisTab(session.cid);
      if (outcome.status === 'owned-by-another-tab') {
        toast(SESSION_OWNED_ELSEWHERE);
        setIsAutoClaimingSession(false);
        return;
      }

      await setSelectedUser({
        selectedUsername: session.username,
        selectedServerAddress: session.server_address,
        selectedCid: session.cid
      });

      await postAuthSetup(session.cid);

      setHasConnection(true);
      debugLog('WorkspaceLoader', ' Auto-claim complete, workspace loading initiated');
  } catch (error) {
    // Same reason as the branch above: the user is left on a spinner that
    // eventually says "taking longer than expected" and never says why.
    debugLog('WorkspaceLoader', 'Auto-claim session failed:', error);
    toast({
      title: 'Could Not Restore Your Session',
      description: describeFailure(
        error,
        'Your session could not be reconnected. Try signing in again.',
      ),
      variant: 'destructive',
    });
  } finally {
      setIsAutoClaimingSession(false);
    }
  };

  runAsyncSetup(autoClaimSession);
}, [isDevMode, toast, setHasConnection, setIsAutoClaimingSession, autoClaimAttempted]);
}
