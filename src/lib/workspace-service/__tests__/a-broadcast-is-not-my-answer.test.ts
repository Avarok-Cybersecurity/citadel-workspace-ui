/**
 * The write gate matches responses by TYPE, because the workspace protocol
 * carries no request id. That was safe while those variants only ever went to
 * the client that asked — and stopped being safe when the server began
 * broadcasting `Node`, `NodeDeleted` and `NodeMoved` to every other member so
 * their trees would update live.
 *
 * The harm is not a mismatched toast. Alice saves a document that the server is
 * about to refuse; Bob renames any node in the same 15-second window; his
 * broadcast `Node` resolves Alice's pending write; the editor closes on
 * "success" and reloads the stored copy over her buffer. Her text is gone under
 * a green toast — the exact data loss the write gate was built to end.
 *
 * The `matches` parameter existed for precisely this and was passed only for
 * group messages.
 */

import { describe, it, expect, vi } from 'vitest';
import { awaitWriteResponse } from '../await-write-response';
import { eventEmitter } from '@/lib/event-emitter';
import { aboutNode, newChildOf, nodeWithId } from '../response-matchers';

const MINE = 'node-mine';
const THEIRS = 'node-theirs';

function emitLater(response: unknown): void {
  setTimeout(() => eventEmitter.emit('workspace:raw-response', response), 0);
}

describe('a write waiting for its answer', () => {
  it('is not resolved by another member\'s broadcast of the same variant', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    let settled = false;

    const pending: Promise<void> = awaitWriteResponse('UpdateNode', send, nodeWithId(MINE))
      .then(() => { settled = true; })
      .catch(() => { settled = true; });

    emitLater({ Node: { id: THEIRS, name: 'renamed by Bob' } });
    await new Promise((r) => setTimeout(r, 10));

    expect(settled, 'someone else\'s tree write resolved this one').toBe(false);

    // Let our own answer through so the pending promise does not outlive the test.
    eventEmitter.emit('workspace:raw-response', { Node: { id: MINE } });
    await pending;
  });

  it('is resolved by its own answer', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const pending: Promise<void> = awaitWriteResponse('UpdateNode', send, nodeWithId(MINE));

    emitLater({ Node: { id: MINE, name: 'saved' } });

    await expect(pending).resolves.toBeUndefined();
  });

  it('still rejects on a refusal, which carries no node id at all', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const pending: Promise<void> = awaitWriteResponse('UpdateNode', send, nodeWithId(MINE));

    // An Error has to settle the write whatever the matcher says, or a refusal
    // would time out at 15s instead of reporting the reason.
    emitLater({ Error: 'Permission denied: EditMdx required' });

    await expect(pending).rejects.toThrow(/EditMdx/);
  });

  it('tells a delete of one node from a delete of another', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    let settled = false;

    const pending: Promise<void> = awaitWriteResponse('DeleteNode', send, aboutNode(MINE))
      .then(() => { settled = true; })
      .catch(() => { settled = true; });

    emitLater({ NodeDeleted: { node_id: THEIRS, children_deleted: [] } });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);

    eventEmitter.emit('workspace:raw-response', { NodeDeleted: { node_id: MINE, children_deleted: [] } });
    await pending;
  });

  it('matches a creation on what the client actually knows', async () => {
    // The client has no id for a node it has not created yet, so it matches on
    // parent and name. Narrower than any `Node` at all, which is the point.
    const match = newChildOf('office-1', 'Standup');

    expect(match({ id: 'x', parent_id: 'office-1', name: 'Standup' })).toBe(true);
    expect(match({ id: 'y', parent_id: 'office-2', name: 'Standup' })).toBe(false);
    expect(match({ id: 'z', parent_id: 'office-1', name: 'Retro' })).toBe(false);
  });

  it('treats a missing parent_id as the root, not as a mismatch', () => {
    expect(newChildOf(null, 'Workspace')({ name: 'Workspace' })).toBe(true);
  });
});
