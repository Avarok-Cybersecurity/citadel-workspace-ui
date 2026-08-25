/**
 * Serialises writes that read-modify-write the same peer's stored records.
 *
 * The conversation store loads a page or its metadata, mutates it in memory,
 * and saves it back — with awaits in between. Two of those running at once for
 * the same peer both read the same record, each apply their own change to their
 * own copy, and the second save overwrites the first. A received message
 * disappeared exactly this way: delivered, acknowledged, added to the cache,
 * and then written over.
 *
 * Every such operation for a peer therefore runs one at a time, on a chain
 * keyed by the peer. Different peers still proceed concurrently — the record
 * they contend for is per-peer, so there is nothing to gain by serialising
 * across them.
 *
 * This is a lock on OUR writes, not a transaction: IndexedDB gives no
 * cross-await atomicity, and the operations here span several stores.
 */
const chains = new Map<string, Promise<unknown>>();

export function withPeerLock<T>(peerCid: bigint, operation: () => Promise<T>): Promise<T> {
  const key = peerCid.toString();
  // `.catch` so one rejected operation does not cancel those queued behind it.
  const run = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  chains.set(key, run.catch(() => undefined));
  return run;
}
