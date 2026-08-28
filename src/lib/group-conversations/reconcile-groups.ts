import { eventEmitter } from '@/lib/event-emitter';
import { getGroups, updateGroups, resetGroupsForSession } from './group-store';
import type { GroupConversation } from '@/types/group';
import { debugLog } from '@/lib/debug-config';

/**
 * Making the sidebar agree with the server about which groups still exist.
 *
 * Every group event the UI handles is ADDITIVE or self-inflicted: a create you
 * performed, an invite you received, a deletion you were online to be told
 * about. The restore path is a union merge by design, so nothing has ever been
 * able to REMOVE a group the client did not watch disappear.
 *
 * So a group deleted while you were offline — or one you were kicked from
 * while offline, since both arrive as the same `GroupDisconnectNotification`
 * and neither is replayed on reconnect — stays in the sidebar permanently. It
 * survives reloads, because the restore reads it back out of IndexedDB and
 * merges it in again. Clicking it opens a chat whose sends the server drops.
 *
 * The server can answer this: `GroupListGroupsFor` exists, `sendGroupListRequest`
 * sends it, and `GroupListGroupsSuccess` carries the list. Three things were
 * missing. The response was mapped by nothing; `refresh()` had no caller in any
 * component; and even wired up, nothing would have removed anything, because
 * union merge is the only operation the store had.
 */

/**
 * The ids present when the outstanding list request was sent.
 *
 * Reconciling against "everything the client currently holds" would delete a
 * group created in the window between the request going out and the answer
 * coming back — the server's snapshot predates it, so its absence proves
 * nothing. Only ids that were already known when we asked can be judged by the
 * answer.
 *
 * Null means no request is outstanding, so an unsolicited or late list is
 * ignored rather than acted on: a stale snapshot is exactly the thing that
 * would delete a live group.
 */
let askedWith: Set<string> | null = null;

/**
 * Ask the server which groups this account is actually in.
 *
 * The request module is imported lazily, not at the top. It reaches the
 * WebSocket service, and the group store binds this module at startup — so a
 * static import would put the entire socket stack in the store's import graph,
 * which is how a unit test of an unread badge came to construct a
 * BroadcastChannel and die on an unrelated identity call.
 */
export async function requestGroupReconcile(): Promise<void> {
  const { sendGroupListRequest } = await import('./group-requests');
  askedWith = new Set(getGroups().map((g) => g.id));
  await sendGroupListRequest();
}

/**
 * Drop the groups the server did not list.
 *
 * Pure, and deliberately conservative in both directions: a group the server
 * lists but the client does not hold is NOT added here — the wire carries only
 * a group key, with no name, owner or roster, so a group built from one would
 * be a husk. Absence is the only fact a list can establish on its own.
 */
export function reconcileGroups(
  current: GroupConversation[],
  serverIds: readonly string[],
  knownWhenAsked: ReadonlySet<string>,
): GroupConversation[] {
  const live = new Set(serverIds);
  const next = current.filter((g) => live.has(g.id) || !knownWhenAsked.has(g.id));
  return next.length === current.length ? current : next;
}

/** Apply a server list, if one was asked for. Idempotent; safe to call twice. */
export function applyGroupList(serverIds: readonly string[]): void {
  const asked = askedWith;
  if (!asked) return;
  askedWith = null;
  updateGroups((prev) => reconcileGroups(prev, serverIds, asked));
}

export function bindGroupListReconcile(): void {
  eventEmitter.on('group:list-received', (data: { groupIds: string[] }) => {
    applyGroupList(data.groupIds);
  });

  // A session becoming live is the moment the answer can change AND the moment
  // it matters: everything that happened while this account was offline is
  // exactly what no event will ever tell it about.
  //
  // Failure is swallowed on purpose and is not silent-by-accident: if the
  // socket is not ready the request throws, no list arrives, `askedWith` is
  // left set, and the sidebar keeps showing what it showed before — today's
  // behaviour. The alternative, surfacing a toast for a background
  // consistency check nobody asked for, is worse.
  eventEmitter.on('instance:cid-changed', (data: { cid: bigint | null }) => {
    if (data.cid === null) return;
    // Scope first, then ask. The list is a module singleton keyed by nothing,
    // so without the reset the snapshot below would be built from the PREVIOUS
    // account's groups and the server's answer would be applied to them.
    void resetGroupsForSession()
      .then(() => requestGroupReconcile())
      .catch((error) => {
        debugLog('GroupReconcile', 'Could not ask the server for the group list', error);
      });
  });
}

/** Test seam: forget any outstanding request. */
export function resetGroupReconcileState(): void {
  askedWith = null;
}
