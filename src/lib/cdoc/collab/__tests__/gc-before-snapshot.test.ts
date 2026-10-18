/**
 * Tombstone GC runs only immediately before a snapshot, by the client storing it, only when
 * configured 'whenAlone' and no other peer is present; otherwise the snapshot is uncollected.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentSessionConfig } from '../ports';
import { ALICE, BOB, newKernel, openTab, type Tab } from './doubles/harness';

type Stored = { readonly request: { StoreSnapshot: { snapshot: number[] } } };

/** Alice types and deletes, so her replica holds tombstones, then stores a snapshot. */
async function churnThenSnapshot(config: Partial<DocumentSessionConfig>, bobPresent: boolean): Promise<{ alice: Tab; snapshotBytes: number }> {
  const { kernel, clock } = newKernel({});
  const alice: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: 9, ...config });
  const bob: Tab = openTab(kernel, clock, BOB, {});
  const sessions: Tab['session'][] = bobPresent ? [alice.session, bob.session] : [alice.session];
  await alice.session.open();
  if (bobPresent) await bob.session.open();
  await kernel.settle(sessions);
  alice.replica().type('abcdefgh');
  alice.replica().clear();
  await kernel.settle(sessions);
  const stored: Stored[] = kernel.sentOf('StoreSnapshot') as Stored[];
  expect(stored).toHaveLength(1);
  return { alice, snapshotBytes: stored[0].request.StoreSnapshot.snapshot.length };
}

describe('gc before a snapshot', () => {
  it('collects when alone, and the snapshot shrinks', async () => {
    const alone: { alice: Tab; snapshotBytes: number } = await churnThenSnapshot({ gcBeforeSnapshot: 'whenAlone' }, false);
    const uncollected: { alice: Tab; snapshotBytes: number } = await churnThenSnapshot({ gcBeforeSnapshot: 'never' }, false);
    expect(alone.alice.replica().collections).toBe(1);
    expect(alone.snapshotBytes).toBeLessThan(uncollected.snapshotBytes / 4);
  });

  it('does not collect while another peer is present', async () => {
    const { alice } = await churnThenSnapshot({ gcBeforeSnapshot: 'whenAlone' }, true);
    expect(alice.replica().collections).toBe(0);
  });

  it('never collects when configured never, even alone', async () => {
    const { alice } = await churnThenSnapshot({ gcBeforeSnapshot: 'never' }, false);
    expect(alice.replica().collections).toBe(0);
  });
});
