/**
 * Opening reads the whole log in order, page by page and over a snapshot; what the server
 * refuses, denies, or sends in a format this client does not read is reported, never dropped.
 */
import { describe, expect, it } from 'vitest';
import { CDOC_CRDT_DOC_VERSION } from '../relay-limits';
import { ALICE, BOB, NODE, newKernel, openTab, type Tab } from './doubles/harness';

describe('opening a document', () => {
  it('pulls page after page until has_more is false, then holds every update in order', async () => {
    const { kernel, clock } = newKernel({ maxUpdatesPerPull: 2 });
    const writer: Tab = openTab(kernel, clock, ALICE, {});
    await writer.session.open();
    await kernel.settle([writer.session]);
    writer.replica().type('hello');
    await kernel.settle([writer.session]);

    const reader: Tab = openTab(kernel, clock, BOB, {});
    await reader.session.open();
    await kernel.settle([reader.session]);
    const since: bigint[] = kernel.sentOf('Pull').filter((r: { cid: bigint }): boolean => r.cid === BOB).map((r: { request: { Pull: { since_seq: bigint } } }): bigint => r.request.Pull.since_seq);
    expect(since).toEqual([0n, 2n, 4n]);
    expect(reader.replica().text).toBe('hello');
  });

  it('opens over the stored snapshot, then applies only the updates after it', async () => {
    const { kernel, clock } = newKernel({});
    const writer: Tab = openTab(kernel, clock, ALICE, { snapshotAfterLocalUpdates: 3 });
    await writer.session.open();
    await kernel.settle([writer.session]);
    writer.replica().type('abc');
    await kernel.settle([writer.session]);
    writer.replica().type('de');
    await kernel.settle([writer.session]);
    expect(kernel.log.snapshotUpto).toBe(3n);

    const reader: Tab = openTab(kernel, clock, BOB, {});
    await reader.session.open();
    await kernel.settle([reader.session]);
    expect(reader.sources).toHaveLength(1);
    expect('snapshot' in reader.sources[0]).toBe(true);
    expect(reader.replica().text).toBe('abcde');
    expect(reader.session.seq).toBe(5n);
  });

  it('re-opens over a newer snapshot while open, keeping its unacknowledged edits', async () => {
    const { kernel, clock } = newKernel({});
    const alice: Tab = openTab(kernel, clock, ALICE, {});
    const bob: Tab = openTab(kernel, clock, BOB, { snapshotAfterLocalUpdates: 4 });
    await alice.session.open();
    await bob.session.open();
    await kernel.settle([alice.session, bob.session]);

    kernel.setLink(ALICE, 'down');
    bob.replica().type('bbbb');
    await kernel.settle([alice.session, bob.session]);
    expect(kernel.log.snapshotUpto).toBe(4n);

    // Typed the moment the link is back: the answer to the re-pull (a snapshot newer than
    // Alice's replica) arrives while this edit is still unacknowledged.
    kernel.setLink(ALICE, 'up');
    alice.replica().type('A');
    await kernel.settle([alice.session, bob.session]);
    expect(alice.replicas).toHaveLength(2);
    expect(alice.replicas[0].disposed).toBe(true);
    expect(alice.replica().text).toHaveLength(5);
    expect(bob.replica().text).toBe(alice.replica().text);
  });
});

describe('what the session reports', () => {
  it('surfaces a refused Append and stops writing', async () => {
    const { kernel, clock } = newKernel({ maxUpdateBytes: 8 });
    const alice: Tab = openTab(kernel, clock, ALICE, {});
    await alice.session.open();
    await kernel.settle([alice.session]);
    alice.replica().type('a');
    await kernel.settle([alice.session]);
    alice.replica().type('b');
    await kernel.settle([alice.session]);

    expect(alice.problems.map((p) => p.problem.kind)).toEqual(['refused']);
    const problem: (typeof alice.problems)[number]['problem'] = alice.problems[0].problem;
    expect(problem.kind === 'refused' && typeof problem.refusal !== 'string' && 'UpdateTooLarge' in problem.refusal).toBe(true);
    expect(kernel.sentOf('Append')).toHaveLength(1);
  });

  it('refuses locally an update over the limit it shares with the server, and never sends it', async () => {
    const { kernel, clock } = newKernel({});
    const alice: Tab = openTab(kernel, clock, ALICE, { limits: { maxUpdateBytes: 8, maxSnapshotBytes: 4_194_304, maxAwarenessBytes: 4_096, awarenessPerSecond: 20 } });
    await alice.session.open();
    await kernel.settle([alice.session]);
    alice.replica().type('a');
    await kernel.settle([alice.session]);
    expect(alice.problems.map((p) => p.problem)).toEqual([expect.objectContaining({ kind: 'tooLarge', what: 'update', maxBytes: 8 })]);
    expect(kernel.sentOf('Append')).toHaveLength(0);
  });

  it('surfaces a denied write permission', async () => {
    const { kernel, clock } = newKernel({});
    kernel.deny(BOB, 'EditMdx');
    const bob: Tab = openTab(kernel, clock, BOB, {});
    await bob.session.open();
    await kernel.settle([bob.session]);
    bob.replica().type('x');
    await kernel.settle([bob.session]);
    expect(bob.problems.map((p) => p.problem)).toEqual([{ kind: 'permissionDenied', message: 'Permission denied: EditMdx required' }]);
  });

  it('names a doc_version mismatch and does not apply the update', async () => {
    const { kernel, clock } = newKernel({});
    const bob: Tab = openTab(kernel, clock, BOB, {});
    await bob.session.open();
    await kernel.settle([bob.session]);
    kernel.inject(BOB, { DocumentUpdated: { node_id: NODE, seq: 1n, doc_version: CDOC_CRDT_DOC_VERSION + 1, update: [1, 2, 3], author_cid: ALICE } });
    await kernel.settle([bob.session]);

    expect(bob.problems).toHaveLength(1);
    expect(bob.problems[0].name).toBe('DocVersionMismatchError');
    expect(bob.problems[0].problem).toEqual({ kind: 'docVersionMismatch', expected: CDOC_CRDT_DOC_VERSION, received: CDOC_CRDT_DOC_VERSION + 1, where: 'update 1' });
    expect(bob.session.seq).toBe(0n);
  });

  it('ignores traffic for another node', async () => {
    const { kernel, clock } = newKernel({});
    const bob: Tab = openTab(kernel, clock, BOB, {});
    await bob.session.open();
    await kernel.settle([bob.session]);
    kernel.inject(BOB, { Refused: { NoSuchNode: { node_id: 'another-node' } } });
    await kernel.settle([bob.session]);
    expect(bob.problems).toEqual([]);
  });
});
