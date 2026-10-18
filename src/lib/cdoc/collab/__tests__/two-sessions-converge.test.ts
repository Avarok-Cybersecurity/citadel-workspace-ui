/**
 * Two people editing one document end up with the same document: through the relay, across a
 * dropped push, across a link drop with edits made offline, and with two tabs of one account,
 * whose own updates the server never pushes to them.
 */
import { describe, expect, it } from 'vitest';
import { ALICE, BOB, newKernel, openTab, type Tab } from './doubles/harness';

async function bothOpen(): Promise<{ kernel: ReturnType<typeof newKernel>['kernel']; alice: Tab; bob: Tab; all: Tab[] }> {
  const { kernel, clock } = newKernel({});
  const alice: Tab = openTab(kernel, clock, ALICE, {});
  const bob: Tab = openTab(kernel, clock, BOB, {});
  await alice.session.open();
  await bob.session.open();
  await kernel.settle([alice.session, bob.session]);
  return { kernel, alice, bob, all: [alice, bob] };
}

describe('two sessions on one document', () => {
  it('converge on interleaved typing through the relay', async () => {
    const { kernel, alice, bob } = await bothOpen();
    alice.replica().type('Hello');
    bob.replica().type('World');
    alice.replica().type('!');
    await kernel.settle([alice.session, bob.session]);

    expect(alice.replica().text).toHaveLength(11);
    expect(bob.replica().text).toBe(alice.replica().text);
    expect(alice.session.seq).toBe(11n);
    expect(bob.session.seq).toBe(11n);
    expect(alice.problems).toEqual([]);
    expect(bob.problems).toEqual([]);
  });

  it('applies its own update once: the Appended is not applied again from a pull', async () => {
    const { kernel, alice, bob } = await bothOpen();
    alice.replica().type('abc');
    await kernel.settle([alice.session, bob.session]);
    // Every Append answered, none pulled back: Alice sent no Pull after the opening one.
    expect(kernel.sentOf('Pull').filter((r: { cid: bigint }): boolean => r.cid === ALICE)).toHaveLength(1);
    expect(alice.replica().text).toBe('abc');
  });

  it('closes a gap left by a dropped push by pulling from the last seq it holds', async () => {
    const { kernel, alice, bob } = await bothOpen();
    alice.replica().type('ab');
    await kernel.settle([alice.session, bob.session]);
    kernel.dropPushesTo(BOB, 2);
    alice.replica().type('cde');
    await kernel.settle([alice.session, bob.session]);

    const bobPulls: bigint[] = kernel.sentOf('Pull').filter((r: { cid: bigint }): boolean => r.cid === BOB).map((r: { request: { Pull: { since_seq: bigint } } }): bigint => r.request.Pull.since_seq);
    expect(bobPulls).toEqual([0n, 2n]);
    expect(bob.replica().text).toBe('abcde');
    expect(bob.session.seq).toBe(5n);
  });

  it('after a reconnect, sends what was typed offline and pulls what it missed', async () => {
    const { kernel, alice, bob } = await bothOpen();
    kernel.setLink(ALICE, 'down');
    alice.replica().type('xy');
    bob.replica().type('12');
    await kernel.settle([alice.session, bob.session]);
    expect(kernel.sentOf('Append').filter((r: { cid: bigint }): boolean => r.cid === ALICE)).toHaveLength(0);

    kernel.setLink(ALICE, 'up');
    await kernel.settle([alice.session, bob.session]);
    expect(alice.replica().text).toHaveLength(4);
    expect(bob.replica().text).toBe(alice.replica().text);
    expect(kernel.sentOf('Pull').filter((r: { cid: bigint }): boolean => r.cid === ALICE).at(-1)?.request.Pull.since_seq).toBe(0n);
  });

  it('two tabs of one account converge although the server pushes neither the other\'s updates', async () => {
    const { kernel, clock } = newKernel({});
    const tab1: Tab = openTab(kernel, clock, ALICE, {});
    const tab2: Tab = openTab(kernel, clock, ALICE, {});
    const bob: Tab = openTab(kernel, clock, BOB, {});
    const all: Tab[] = [tab1, tab2, bob];
    for (const tab of all) await tab.session.open();
    await kernel.settle(all.map((t: Tab) => t.session));

    // Tab 2 types nothing yet: only tab 1's Appended answers, which reach both tabs of the
    // session, can tell it that the log moved.
    tab1.replica().type('one');
    await kernel.settle(all.map((t: Tab) => t.session));
    expect(tab2.replica().text).toBe('one');

    tab2.replica().type('two');
    await kernel.settle(all.map((t: Tab) => t.session));

    expect(tab1.replica().text).toHaveLength(6);
    expect(tab2.replica().text).toBe(tab1.replica().text);
    expect(bob.replica().text).toBe(tab1.replica().text);
    expect(tab1.replica().client).not.toBe(tab2.replica().client);
  });
});
