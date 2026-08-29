/**
 * The subscriber that was missing.
 *
 * `use-group-state` waits on six group:* events; nothing emitted them, and
 * GroupCreateSuccess was handled nowhere. createGroup fired its request, the
 * response fell on the floor, and the sidebar's group list stayed empty
 * forever — the Create Group dialog submitted, closed, and produced nothing.
 *
 * This listens to the same 'websocket-message' stream the peer-registration
 * store uses, maps each group response with the pure `toGroupEvents`, and emits.
 * All the mapping decisions live there; this is the shell that does the I/O.
 */

import { eventEmitter } from '../event-emitter';
import { connectionManager } from '../connection';
import { getSelectedUser } from '../tab-context';
import { debugLog } from '@/lib/debug-config';
import { toGroupEvents } from './group-events';
import { p2pRegistrationService } from '../p2p-registration-service';
import type { TabUserContext } from '@/lib/tab-context';

let started: boolean = false;

async function resolveSelf(): Promise<{ cid: bigint; username: string } | null> {
  const cid: bigint | undefined = connectionManager.getConnectionInfo()?.cid;
  if (cid === undefined || cid === null) return null;

  const tab: TabUserContext | null = await getSelectedUser();
  return { cid, username: tab?.selectedUsername ?? '' };
}

/**
 * Begin translating group responses into UI events. Idempotent — a second call
 * is a no-op rather than a second subscription, which would double every event.
 */
export function startGroupResponseService(): void {
  if (started) return;
  started = true;

  eventEmitter.on('websocket-message', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const message: Record<string, unknown> = raw as Record<string, unknown>;

    void (async (): Promise<void> => {
      const self: { cid: bigint; username: string; } | null = await resolveSelf();
      if (!self) return;

      // The wire names peers only by CID; the registration roster is the one
      // authority for their usernames. The cid string is the explicit fallback
      // for a peer the roster has not seen — non-empty on purpose, because an
      // invite whose inviter has no name at all is dropped as malformed.
      const { registeredPeers } = p2pRegistrationService.getPeers();
      const peerName = (cid: bigint): string =>
        registeredPeers.find((p) => p.cid === cid)?.username ?? cid.toString();

      for (const event of toGroupEvents(message, self.cid, self.username, peerName)) {
        debugLog('GroupResponseService', `${event.name}`, event.payload);
        eventEmitter.emit(event.name, event.payload);
      }
    })().catch((error) => {
      // `void` alone marks the promise handled for lint but does NOT catch —
      // a malformed group key throws by design, and unhandled it would surface
      // as an unhandled rejection rather than a log line.
      debugLog('GroupResponseService', 'Failed to handle a group response', error);
    });
  });

  debugLog('GroupResponseService', 'Listening for group responses');
}
