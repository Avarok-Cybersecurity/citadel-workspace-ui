/**
 * Hand the tab's selected session to the WASM client after a list load.
 *
 * Split out of `useOrphanSessions` for the length cap. It is best-effort by
 * design: the list has already been rendered by the time this runs, and a WASM
 * client that will not take the session is not a reason to withhold the
 * navbar the user is looking at.
 */
import { getSelectedUser, type TabUserContext } from '@/lib/tab-context';
import { wasmConnectionManager } from '@/lib/wasm-connection-manager';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import type { OrphanSessionWithWorkspace } from './useOrphanSessions';

export async function syncSelectedSessionToWasm(
  sessions: readonly OrphanSessionWithWorkspace[],
): Promise<void> {
  const tabSelection: TabUserContext | null = await getSelectedUser();
  if (!tabSelection?.selectedCid) return;

  const selected: OrphanSessionWithWorkspace | undefined = sessions.find(
    (session) => session.cid === tabSelection.selectedCid,
  );
  if (selected?.cid === undefined) return;

  try {
    await wasmConnectionManager.addSession(selected.cid.toString());
    if (selected.peer_connections) {
      p2pRegistrationService.syncPeerConnectionsFromSession(selected.peer_connections).catch(() => {});
    }
  } catch {
    // Best-effort: see the note above.
  }
}
