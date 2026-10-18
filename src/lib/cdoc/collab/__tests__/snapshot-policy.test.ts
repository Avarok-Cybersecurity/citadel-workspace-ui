/**
 * A snapshot is stored when the server's compaction hint asks, or after the configured number
 * of local updates, only while the replica is exactly the log's prefix, and never on a timer.
 */
import { describe, expect, it } from 'vitest';
import type { CachedDocument, DocumentCache } from '../ports';
import { ALICE, BOB, newKernel, openTab, type Tab } from './doubles/harness';

type Stored = { readonly cid: bigint; readonly request: { StoreSnapshot: { upto_seq: bigint } } };

describe('snapshot policy', () => {
  it('stores one after the configured number of local updates, covering exactly what is acknowledged', async () => {
    const { kernel, clock } = newKernel({});
    const alice: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: 3 });
    await alice.session.open();
    await kernel.settle([alice.session]);
    alice.replica().type('ab');
    await kernel.settle([alice.session]);
    expect(kernel.sentOf('StoreSnapshot')).toHaveLength(0);

    alice.replica().type('c');
    await kernel.settle([alice.session]);
    expect(kernel.sentOf('StoreSnapshot').map((r: Stored): bigint => r.request.StoreSnapshot.upto_seq)).toEqual([3n]);
    expect(kernel.log.snapshotUpto).toBe(3n);
    expect(kernel.log.held).toBe(0);
  });

  it('with no local count configured, stores one only when the server asks', async () => {
    const { kernel, clock } = newKernel({ snapshotMinUpdates: 4n });
    const alice: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: null });
    await alice.session.open();
    await kernel.settle([alice.session]);
    alice.replica().type('abc');
    await kernel.settle([alice.session]);
    expect(kernel.sentOf('StoreSnapshot')).toHaveLength(0);

    alice.replica().type('d');
    await kernel.settle([alice.session]);
    expect(kernel.sentOf('StoreSnapshot').map((r: Stored): bigint => r.request.StoreSnapshot.upto_seq)).toEqual([4n]);
  });

  it('never stores one on a timer', async () => {
    const { kernel, clock } = newKernel({});
    const alice: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: null });
    await alice.session.open();
    await kernel.settle([alice.session]);
    alice.replica().type('abc');
    await kernel.settle([alice.session]);
    for (let minute: number = 0; minute < 60; minute += 1) {
      clock.advance(60_000);
      await kernel.settle([alice.session]);
    }
    expect(kernel.sentOf('StoreSnapshot')).toHaveLength(0);
  });

  it('waits while a peer\'s update is past a gap, then covers it', async () => {
    const { kernel, clock } = newKernel({});
    const alice: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: 3 });
    const bob: Tab = openTab(kernel, clock, BOB, {});
    await alice.session.open();
    await bob.session.open();
    await kernel.settle([alice.session, bob.session]);
    alice.replica().type('z');
    await kernel.settle([alice.session, bob.session]);
    kernel.dropPushesTo(ALICE, 1);
    bob.replica().type('x');
    alice.replica().type('ab');
    await kernel.settle([alice.session, bob.session]);
    const uptos: bigint[] = kernel.sentOf('StoreSnapshot').map((r: Stored): bigint => r.request.StoreSnapshot.upto_seq);
    expect(uptos).toEqual([4n]);
    expect(alice.problems).toEqual([]);
  });

  it('saves the stored snapshot to the local cache, and a later open starts from it', async () => {
    const { kernel, clock } = newKernel({});
    const saved: Map<string, CachedDocument> = new Map<string, CachedDocument>();
    const cache: DocumentCache = {
      load: (nodeId: string): Promise<CachedDocument | null> => Promise.resolve(saved.get(nodeId) ?? null),
      save: (nodeId: string, document: CachedDocument): Promise<void> => { saved.set(nodeId, document); return Promise.resolve(); },
    };
    const alice: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: 2 }, cache);
    await alice.session.open();
    await kernel.settle([alice.session]);
    alice.replica().type('ab');
    await kernel.settle([alice.session]);
    alice.replica().type('c');
    await kernel.settle([alice.session]);
    expect([...saved.values()].map((d: CachedDocument): bigint => d.seq)).toEqual([2n]);

    const again: Tab = openTab(kernel, clock, ALICE, {}, cache);
    await again.session.open();
    await kernel.settle([again.session]);
    expect('snapshot' in again.sources[0]).toBe(true);
    expect(kernel.sentOf('Pull').at(-1)?.request.Pull.since_seq).toBe(2n);
    expect(again.replica().text).toBe('abc');
  });
});
