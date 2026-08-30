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
import type { StoredSession } from '@/types/session-types';
import { getSelectedUser } from '../tab-context';
import { debugLog } from '@/lib/debug-config';
import { toGroupEvents } from './group-events';
import { p2pRegistrationService } from '../p2p-registration-service';
import type { TabUserContext } from '@/lib/tab-context';

let started: boolean = false;

/** Exported for its test: the fallback chain is the thing under test. */
export async function resolveSelfForTest(): Promise<{ cid: bigint; username: string } | null> {
  return resolveSelf();
}

/**
 * The stored-session username, once per cid.
 *
 * No clear() seam: a username does not change while the tab lives, and the
 * tests reset the module instead. An export nothing calls is the thing
 * `unreferenced exports` is there to stop, and it caught this one.
 */
const fallbackUsernames: Map<bigint, string> = new Map<bigint, string>();

async function resolveSelf(): Promise<{ cid: bigint; username: string } | null> {
  const cid: bigint | undefined = connectionManager.getConnectionInfo()?.cid;
  if (cid === undefined || cid === null) return null;

  const tab: TabUserContext | null = await getSelectedUser();
  const selected: string | undefined = tab?.selectedUsername;
  if (selected) return { cid, username: selected };

  // An empty username is not a name, and it reaches the screen. CI shows
  // `Group created: {name: , ownerId: ..., ownerUsername: }` on the CREATOR's
  // own page: `group:created` falls back to `ownerUsername` for the label, so
  // a group the user had just named appeared in their sidebar with no name at
  // all.
  //
  // The tab's stored session, not `getConnectionInfo().username`. That one
  // belongs to the CONNECTION rather than to this tab and is wrong whenever a
  // browser holds two sessions -- which is the priority rule
  // `check-one-answer-to-who-am-i` exists to keep.
  //
  // Memoised per cid, and that is not an optimisation. `getTabSelectedSession`
  // calls `getSelectedUser` AGAIN -- the call five lines above -- and, since
  // the username is still missing, goes on to read the active session index
  // too. Unmemoised, that is two storage reads for EVERY websocket message on
  // the path that handles every websocket message. A username does not change
  // within a session, so it is asked once.
  const cached: string | undefined = fallbackUsernames.get(cid);
  if (cached !== undefined) return { cid, username: cached };

  const session: StoredSession | null = await connectionManager.getTabSelectedSession();
  const username: string = session?.username ?? '';
  fallbackUsernames.set(cid, username);
  return { cid, username };
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
