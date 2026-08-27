/**
 * Writing the tree to disk, with a failure the user can actually find out about.
 *
 * `RevfsIO.execute` never rejects — a full disk, a revoked OPFS handle or a
 * serialisation error all come back as `{ success: false }` on a resolved
 * promise. Every one of the twenty call sites did `await io.execute({ type:
 * 'persist-tree', ... })` and discarded that, so the in-memory tree and the disk
 * diverged silently and the divergence surfaced only as "my folder is gone"
 * after the next reload.
 *
 * Deliberately NOT a throw. By the time this runs the in-memory tree has already
 * been mutated and, for a peer operation, the op may already have been sent —
 * so throwing would report a failure for something that partly succeeded, and
 * leave the caller no way to distinguish the two. The operation DID happen; what
 * failed is its durability.
 *
 * So: one event, raised once, from one place. Whoever wires a "changes may not
 * survive a reload" notice does it here rather than at twenty call sites, and
 * until then the failure is at least loud in the log instead of absent.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import type { RevfsIO } from './revfs-io';
import type { RevfsNode } from '@/types/revfs-types';

export async function persistTree(io: RevfsIO, treeKey: string, tree: RevfsNode): Promise<void> {
  const result = await io.execute({ type: 'persist-tree', treeKey, tree });

  if (result.type !== 'persist-tree' || !result.success) {
    debugLog('RevfsPersist', `Tree ${treeKey} could not be written to disk — changes may not survive a reload`);
    eventEmitter.emit('revfs:persist-failed', { treeKey });
  }
}
