/**
 * The subscriber that was missing.
 *
 * `use-group-state` waits on six group:* events; nothing emitted them, and
 * GroupCreateSuccess was handled nowhere. createGroup fired its request, the
 * response fell on the floor, and the sidebar's group list stayed empty
 * forever — the Create Group dialog submitted, closed, and produced nothing.
 *
 * This listens to the same 'websocket-message' stream the peer-registration
 * store uses, maps each group response with the pure `toGroupEvent`, and emits.
 * All the mapping decisions live there; this is the shell that does the I/O.
 */

import { eventEmitter } from '../event-emitter';
import { connectionManager } from '../connection';
import { getSelectedUser } from '../tab-context';
import { debugLog } from '@/lib/debug-config';
import { toGroupEvent } from './group-events';

let started = false;

async function resolveSelf(): Promise<{ cid: bigint; username: string } | null> {
  const cid = connectionManager.getConnectionInfo()?.cid;
  if (cid === undefined || cid === null) return null;

  const tab = await getSelectedUser();
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
    const message = raw as Record<string, unknown>;

    void (async () => {
      const self = await resolveSelf();
      if (!self) return;

      const event = toGroupEvent(message, self.cid, self.username);
      if (!event) return;

      debugLog('GroupResponseService', `${event.name}`, event.payload);
      eventEmitter.emit(event.name, event.payload);
    })().catch((error) => {
      // `void` alone marks the promise handled for lint but does NOT catch —
      // a malformed group key throws by design, and unhandled it would surface
      // as an unhandled rejection rather than a log line.
      debugLog('GroupResponseService', 'Failed to handle a group response', error);
    });
  });

  debugLog('GroupResponseService', 'Listening for group responses');
}
