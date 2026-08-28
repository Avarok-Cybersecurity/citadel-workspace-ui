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
import { instanceManager } from '@/lib/multi-instance';
import { pickSessionToClaim } from '@/lib/sessions/pick-session-to-claim';
import { ConnectionManager } from '@/lib/connection';
import { websocketService } from '@/lib/websocket-service';
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

      try {
        await websocketService.claimSession(session.cid, true);
        debugLog('WorkspaceLoader', ' Session claimed successfully (was orphaned)');
      } catch (claimError: unknown) {
        if (claimError instanceof Error && claimError.message?.includes('not orphaned')) {
          // "Not orphaned" means somebody has it -- and that somebody may be
          // another TAB in this browser, not a stale server-side record. This
          // used to be treated as success outright, so a second tab adopted a
          // session the first was actively using. Both then registered the same
          // CID, and findInstanceByCid returns the first map hit: every
          // CID-routed notification -- messages, transfer ticks, call media --
          // went to one tab while the other rendered the same conversation and
          // silently never updated, with the winner able to flip on
          // re-registration.
          const owner = instanceManager.findInstanceByCid(session.cid);
          if (owner && owner !== instanceManager.instanceId) {
            debugLog('WorkspaceLoader', ` Session ${session.cid} is owned by ${owner}; not adopting`);
            toast({
              title: 'Already Open Elsewhere',
              description:
                'This session is open in another tab. Switch to it, or pick a different session here.',
            });
            setIsAutoClaimingSession(false);
            return;
          }
          debugLog('WorkspaceLoader', ' Session is still active (not orphaned), no other tab owns it');
        } else {
          throw claimError;
        }
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
