/**
 * Switch this tab to a session the agent already holds.
 *
 * Moved out of `useOrphanSessions.handleNavigate` unchanged so the account deep
 * link can take the same path: one sequence -- claim, select, post-auth setup,
 * messaging, activation event, navigate -- with one place for a step to be
 * added. A second copy is how the orphan path once came to skip
 * `getTreeSchema` while the login path ran it.
 */
import { claimSessionForThisTab, offerTakeover, type ClaimOutcome, type TakeoverCallbacks } from './claim-session';
import { sessionSwitchToasts, type SessionSwitchToasts } from './session-switch-toasts';
import { readLastLocation } from './last-location';
import { markLastAccessed } from './last-accessed';
import { describeFailure } from '@/lib/failure-message';
import { connectionManager } from '@/lib/connection';
import { setSelectedUser } from '@/lib/tab-context';
import { startMessagingForSession } from '@/lib/start-messaging';
import { instanceManager, instanceChannel } from '@/lib/multi-instance';
import { getWorkspacePath } from '@/lib/workspace-navigation';
import { eventEmitter } from '@/lib/event-emitter';
import { postAuthSetup } from '@/lib/post-auth-setup';
import { debugLog } from '@/lib/debug-config';
import type { ToastOptions } from '@/hooks/use-toast';

/** The fields of a navbar session this sequence reads. */
export interface SwitchTarget {
  cid: bigint;
  username: string;
  server_address: string;
  workspaceName: string;
  storedSessionIndex: number;
}

export interface SwitchCallbacks extends TakeoverCallbacks {
  navigate: (path: string) => void;
  /** The `toast` from useToast(); typed from its own options so the two cannot drift. */
  toast: (opts: ToastOptions) => unknown;
}

export async function switchToSession(session: SwitchTarget, callbacks: SwitchCallbacks): Promise<void> {
  const { navigate, toast } = callbacks;
  const notices: SessionSwitchToasts = sessionSwitchToasts(session.cid, session.workspaceName);
  try {
    debugLog('OrphanSessionsNavbar', 'Navigating to workspace:', session.workspaceName);

    markLastAccessed(session.cid);

    toast(notices.progress);

    const outcome: ClaimOutcome = await claimSessionForThisTab(session.cid);
    if (outcome.status === 'owned-by-another-tab') {
      toast(notices.ownedElsewhere);
      return;
    }
    if (outcome.status === 'held-by-another-connection') {
      await offerTakeover(session.username, callbacks);
      return;
    }

    if (session.storedSessionIndex >= 0) await connectionManager.setActiveSessionIndex(session.storedSessionIndex);
    await setSelectedUser({
      selectedUsername: session.username, selectedServerAddress: session.server_address, selectedCid: session.cid
    });

    instanceManager.setCid(session.cid);
    instanceChannel.announcePresence();

    // Single source of truth for post-auth setup. Previously this branch
    // hand-rolled `setConnectionId → loadWorkspace → listNodes` and
    // missed `getTreeSchema`, leaving the orphan-claim path divergent
    // from the login path. Using postAuthSetup keeps the two paths
    // aligned and ensures any future steps added to postAuthSetup are
    // applied uniformly.
    await postAuthSetup(session.cid);

    // Was `catch (_) { }`. Best-effort is fine; invisible is not -- a claim
    // that brought back a session with dead messaging looked exactly like one
    // that worked.
    await startMessagingForSession(session.cid.toString());

    eventEmitter.emit('session:activated', {
      cid: session.cid.toString(), username: session.username,
      serverAddress: session.server_address, activationType: 'claim' as const
    });

    // Back where they were, when there is a where. An in-tab refresh keeps
    // its place because the URL is the state; this path -- the actual second
    // session, from the landing page -- navigated to the workspace root with
    // no params, so a user who closed the browser mid-conversation landed on
    // the default office and re-found it by hand, every day.
    navigate(readLastLocation(session.cid) ?? getWorkspacePath());

    toast(notices.connected);
  } catch (error) {
    debugLog('OrphanSessionsNavbar', 'Failed to navigate to workspace:', error);
    toast(notices.failed(describeFailure(error, "Could not reconnect to workspace. Please try logging in again.")));
  }
}
