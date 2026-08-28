import { claimSessionForThisTab, SESSION_OWNED_ELSEWHERE } from '@/lib/sessions/claim-session';
import { markLastAccessed } from '@/lib/sessions/last-accessed';
import { connectionManager } from "@/lib/connection";
import { eventEmitter } from "@/lib/event-emitter";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { setSelectedUser } from "@/lib/tab-context";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { debugLog } from '@/lib/debug-config';
import type { ToastOptions } from '@/hooks/use-toast';

interface SessionRedirectTarget {
  cid: bigint;
  username: string;
  server_address: string;
}

interface SessionRedirectCallbacks {
  navigate: (path: string) => void;
  /** The `toast` from useToast(); typed from its own options so the two cannot drift. */
  toast: (opts: ToastOptions) => unknown;
  onNext: (connectionId: string) => void;
}

/**
 * Seamlessly redirect to an existing session instead of showing an error.
 * Provides smooth UX: user doesn't need to know the session already exists.
 */
export async function redirectToExistingSession(
  session: SessionRedirectTarget,
  callbacks: SessionRedirectCallbacks,
): Promise<void> {
  const { navigate, toast, onNext } = callbacks;

  try {
    debugLog('Login', 'Redirecting to existing session seamlessly:', session.username);

    toast({
      title: "Reconnecting...",
      description: `Loading ${session.username}'s workspace`,
      variant: 'success',
    });

    markLastAccessed(session.cid);

    const outcome = await claimSessionForThisTab(session.cid);
    if (outcome.status === 'owned-by-another-tab') {
      toast(SESSION_OWNED_ELSEWHERE);
      return;
    }

    const storedSessions = connectionManager.getStoredSessions();
    const storedIndex = storedSessions.sessions.findIndex(
      (stored) =>
        stored.username === session.username &&
        stored.serverAddress === session.server_address
    );

    if (storedIndex >= 0) {
      await connectionManager.setActiveSessionIndex(storedIndex);
    }

    await setSelectedUser({
      selectedUsername: session.username,
      selectedServerAddress: session.server_address,
      selectedCid: session.cid
    });

    await postAuthSetup(session.cid);

    eventEmitter.emit('session:activated', {
      cid: session.cid.toString(),
      username: session.username,
      serverAddress: session.server_address,
      activationType: 'claim',
    });
    debugLog('Login', 'Emitted session:activated for redirect to existing session');

    navigate(getWorkspacePath());

    toast({
      title: "Connected!",
      description: `Now viewing ${session.username}'s workspace`,
      variant: 'success',
    });

    onNext(session.cid.toString());
  } catch (error) {
    debugLog('Login', 'Failed to redirect to existing session:', error);
    toast({
      title: "Connection Failed",
      description: "Could not reconnect to workspace. Please try again.",
      variant: "destructive",
    });
  }
}
