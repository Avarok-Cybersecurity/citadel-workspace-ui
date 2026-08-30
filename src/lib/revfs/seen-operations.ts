/**
 * An operation is applied once, however many times it arrives.
 *
 * CI evidence, run 33304689050: Bob sent SEVEN `SyncRequest`s and Alice's
 * handler ran for ONE HUNDRED of them. Bob applied the same `Mkdir` twice,
 * 21ms apart, with one `op_id`. The reliable transport redelivers, and nothing
 * on this side noticed.
 *
 * The cost is not the duplicate work. Every redelivered `SyncRequest` makes the
 * receiver answer with a fresh 564-byte `SyncResponse` on the same reliable
 * channel, so seven requests became a hundred replies — and the `PlaceFile` and
 * `Rmdir` the user actually asked for queued behind that flood and never
 * arrived. `Peer Sees File: FAIL` and a folder that stayed on the peer's screen
 * are both downstream of it.
 *
 * Bounded, because op ids are unbounded. A few hundred is far more than a
 * redelivery window and small enough to be free.
 */
const MAX_REMEMBERED: number = 500;

const seen: Map<string, Set<string>> = new Map<string, Set<string>>();

/**
 * True the FIRST time this key sees this op id, false afterwards.
 *
 * Keyed per peer pair: two peers can mint ids independently, and a collision
 * across pairs would silently drop somebody's operation.
 */
export function isNewOperation(key: string, opId: string): boolean {
  let ids: Set<string> | undefined = seen.get(key);
  if (!ids) {
    ids = new Set<string>();
    seen.set(key, ids);
  }
  if (ids.has(opId)) return false;
  ids.add(opId);
  if (ids.size > MAX_REMEMBERED) {
    // Insertion order: drop the oldest, which is the least likely to be
    // redelivered now.
    const oldest: string | undefined = ids.values().next().value;
    if (oldest !== undefined) ids.delete(oldest);
  }
  return true;
}

/** Test seam: the map outlives a module import. */
export function forgetSeenOperations(): void {
  seen.clear();
}
