/**
 * A retry queue that could not be written to disk must say so.
 *
 * `persistTree` already had this: `RevfsIO.execute` never rejects — a full
 * disk, a revoked OPFS handle or a serialisation error all resolve as
 * `{ success: false }` — so it reads the result and raises
 * `revfs:persist-failed`, which `PersistFailureNotice` renders. That fix was
 * applied to one of the two places it belongs.
 *
 * The other is the pending-op queue, which holds operations a peer has not yet
 * acknowledged. All four `persist-pending-ops` calls in revfs-retry.ts
 * discarded the result, so a failed write was invisible: the user made edits,
 * the app queued them for retry, the queue did not reach disk, nothing was
 * shown, and the operations were gone after the next reload. The notice
 * component was already built and already listening; it just never heard about
 * this half.
 *
 * The gate that should have caught it could not. Its receiver pattern was
 * `\w+`, which matches `io.execute(` but not `deps.io.execute(` — and those
 * four are the only unassigned `execute({` calls in the tree, so the gate
 * evaluated zero sites and reported success on every run.
 *
 * Both directions are asserted. Without the success case, a helper hard-wired
 * to emit unconditionally would satisfy the failure case and would put a
 * "changes may not survive a reload" notice in front of every user on every
 * successful write.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventEmitter } from '@/lib/event-emitter';
import { sendAndAwaitAck } from '../revfs-retry';
import { persistPendingOps } from '../persist-pending-ops';
import type { RevfsOperation } from '@/types/revfs-types';
import type { RevfsIO } from '../revfs-io';

const OP: RevfsOperation = {
  op_id: 'op-1', op_type: 'Rmdir', path: '/x', timestamp: 1,
} as unknown as RevfsOperation;

/** An io whose every intent resolves with the given success flag. */
function io(success: boolean): RevfsIO {
  return {
    execute: async (intent: { type: string }): Promise<unknown> => ({ type: intent.type, success }),
  } as unknown as RevfsIO;
}

function deps(persistSucceeds: boolean, sent: boolean): Parameters<typeof sendAndAwaitAck>[0] {
  return {
    state: {
      registerAck: (): Promise<boolean> => Promise.resolve(true),
      cancelAck: (): void => {},
      addPendingOp: (): void => {},
      getPendingOps: (): unknown[] => [],
    },
    io: io(persistSucceeds),
    sendOp: async (): Promise<boolean> => sent,
  } as unknown as Parameters<typeof sendAndAwaitAck>[0];
}

describe('a pending-op write that failed', () => {
  let failures: Array<{ treeKey: string }>;
  const onFailed = (payload: { treeKey: string }): void => { failures.push(payload); };

  beforeEach(() => {
    failures = [];
    eventEmitter.on('revfs:persist-failed', onFailed);
    // The helper logs the loss on the error channel, which is the only channel
    // that survives a production build. Silenced so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    eventEmitter.off('revfs:persist-failed', onFailed);
    vi.restoreAllMocks();
  });

  it('raises revfs:persist-failed directly', async () => {
    await persistPendingOps(io(false), 'tree-1' as never, []);
    expect(failures).toEqual([{ treeKey: 'tree-1' }]);
  });

  it('says nothing when the write succeeded', async () => {
    // The control. A helper that emits unconditionally passes the test above
    // and shows a data-loss warning on every successful write.
    await persistPendingOps(io(true), 'tree-1' as never, []);
    expect(failures).toEqual([]);
  });

  it('reaches the notice from the send path, where the queue is actually written', async () => {
    // The call site, not just the helper. A helper nothing routes through is
    // the same defect one indirection further along.
    const acked: boolean = await sendAndAwaitAck(deps(false, false), 9n, OP, 'send-key' as never);

    expect(acked).toBe(false);
    expect(failures).toEqual([{ treeKey: 'send-key' }]);
  });

  it('says nothing from the send path when the queue was written', async () => {
    await sendAndAwaitAck(deps(true, false), 9n, OP, 'send-key' as never);
    expect(failures).toEqual([]);
  });
});
