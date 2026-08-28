/**
 * Session exit flows for the TopBar.
 *
 * Owns the two ways out of a workspace — Exit to Landing (session stays
 * active) and Sign Out (best-effort backend disconnect plus local cleanup) —
 * and the disconnect-modal state that narrates the second. Split from
 * TopBar.tsx so the bar renders chrome while the leave-the-app policy lives
 * here.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { toastSuccess } from '@/lib/toast-helpers';
import { connectionManager } from '@/lib/connection';
import { clearSelectedUser, getSelectedUser } from '@/lib/tab-context';
import { clearSignOutResidue } from '@/lib/sessions/sign-out-residue';
import { wasmConnectionManager } from '@/lib/wasm-connection-manager';
import type { DisconnectStatus } from '@/components/LoadingModal';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export function useSessionExit() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnectStatus, setDisconnectStatus] = useState<DisconnectStatus>("disconnecting");
  const [disconnectError, setDisconnectError] = useState<string | undefined>();

  const handleExit = () => {
    // Stop WASM connection manager polling (session stays active but this tab won't poll)
    wasmConnectionManager.stop();

    // Just navigate to landing page, keep session active
    runAsyncSetup(clearSelectedUser);
    navigate('/');

    toastSuccess(toast, "Returned to landing page", "Your session is still active. Click your workspace icon to return instantly.");
  };

  const handleSignOut = async () => {
    // Show the disconnect modal immediately
    setDisconnectStatus("disconnecting");
    setDisconnectError(undefined);
    setShowDisconnectModal(true);

    // Sign Out is an explicit user intent — even if the backend disconnect
    // fails (e.g., WS already dropped, no current session on this tab), the
    // local saved-session + tab-context must be cleared and we must navigate
    // to the landing page. Otherwise WorkspaceLoader's auto-claim re-attaches
    // the orphan and the user ends up right back where they started.
    // Guarded, because the blocking modal is ALREADY on screen at this point.
    // Both of these reach IndexedDB, and getDB()'s `blocked` handler warns
    // without settling — so an older tab holding the previous schema version
    // leaves this await pending forever. Unguarded, the status then reaches
    // neither "ready" nor "error", and the z-[100] full-viewport overlay has
    // nothing clickable and no Escape: the only way out of the app is a
    // reload. Same shape as useOrphanSessions, which already settles to
    // "error" and self-closes.
    let currentSession: Awaited<ReturnType<typeof connectionManager.getTabSelectedSession>> = null;
    let tabSelection: Awaited<ReturnType<typeof getSelectedUser>> = null;
    try {
      currentSession = await connectionManager.getTabSelectedSession();
      tabSelection = await getSelectedUser();
    } catch (error) {
      debugLog('TopBar', 'Could not read the stored session for sign-out:', error);
      setDisconnectError(error instanceof Error ? error.message : 'Could not read the stored session.');
      setDisconnectStatus("error");
      setTimeout(() => setShowDisconnectModal(false), 3000);
      return;
    }
    const cid = tabSelection?.selectedCid ?? currentSession?.cid ?? null;

    // Stop WASM connection manager polling regardless of below outcome
    wasmConnectionManager.stop();

    if (cid) {
      try {
        debugLog('TopBar', 'Fully signing out user', currentSession?.username, 'CID:', cid.toString());
        await connectionManager.disconnect({
          cid,
          username: currentSession?.username,
          serverAddress: currentSession?.serverAddress,
        });
      } catch (error) {
        // Best-effort: log the failure but keep cleaning up locally so the user
        // ends up signed out on this device. The server-side orphan (if any)
        // will time out on its own.
        debugLog('TopBar', 'Backend disconnect failed, continuing local sign-out:', error);
      }
    } else {
      debugLog('TopBar', 'No CID available for backend disconnect, skipping');
    }

    setDisconnectStatus("cleaning");

    try {
      if (currentSession?.username && currentSession?.serverAddress) {
        await connectionManager.removeSession(currentSession.username, currentSession.serverAddress);
      }
      await clearSelectedUser();
    } catch (error) {
      debugLog('TopBar', 'Local sign-out cleanup raised, ignoring:', error);
    }

    // "Fully logged out" has to be true of the device, not just the session.
    // The transfer history and the per-peer first-seen keys named who this
    // account talked to and what it exchanged, and survived sign-out in
    // localStorage where anyone with devtools could read them.
    clearSignOutResidue();

    setDisconnectStatus("ready");
  };

  const handleDisconnectComplete = () => {
    setShowDisconnectModal(false);
    if (disconnectStatus === "ready") {
      navigate('/');
      toastSuccess(toast, "Signed out", "You have been fully logged out. You'll need to login again to access this workspace.");
    }
  };

  return {
    showDisconnectModal,
    disconnectStatus,
    disconnectError,
    handleExit,
    handleSignOut,
    handleDisconnectComplete,
  };
}
