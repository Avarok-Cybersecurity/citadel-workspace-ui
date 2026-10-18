/**
 * Awareness out is paced under the kernel's relay limit and always carries the newest record;
 * peers' awareness in becomes named, coloured carets on the editor's PeerOverlay, re-derived
 * after every repaint, and forgotten once a peer goes quiet.
 */
import { describe, expect, it } from 'vitest';
import { DOCUMENTS_RELAY_LIMITS } from '../relay-limits';
import { ALICE, BOB, newKernel, openTab, type Tab } from './doubles/harness';

type Aware = { readonly cid: bigint; readonly request: { Awareness: { payload: number[] } } };

async function pair(): Promise<{ kernel: ReturnType<typeof newKernel>['kernel']; clock: ReturnType<typeof newKernel>['clock']; alice: Tab; bob: Tab }> {
  const { kernel, clock } = newKernel({});
  const alice: Tab = openTab(kernel, clock, ALICE, {});
  const bob: Tab = openTab(kernel, clock, BOB, {});
  await alice.session.open();
  await bob.session.open();
  await kernel.settle([alice.session, bob.session]);
  return { kernel, clock, alice, bob };
}

describe('awareness', () => {
  it('a burst of caret moves never exceeds the relay limit, and the last record sent is the newest', async () => {
    const { kernel, clock, alice, bob } = await pair();
    for (let move: number = 1; move <= 200; move += 1) {
      alice.replica().moveCaret(move);
      clock.advance(5);
      await kernel.settle([alice.session, bob.session]);
    }
    clock.advance(1_000);
    await kernel.settle([alice.session, bob.session]);

    expect(kernel.refusedAwareness).toEqual([]);
    const sent: Aware[] = kernel.sentOf('Awareness').filter((r: { cid: bigint }): boolean => r.cid === ALICE) as Aware[];
    // 1 s of moves at the limit, plus the opening record: never more than the limit allows.
    expect(sent.length).toBeGreaterThan(DOCUMENTS_RELAY_LIMITS.awarenessPerSecond / 2);
    expect(sent.length).toBeLessThanOrEqual(DOCUMENTS_RELAY_LIMITS.awarenessPerSecond + 2);
    const last: { caret: number } = JSON.parse(new TextDecoder().decode(Uint8Array.from(sent[sent.length - 1].request.Awareness.payload))) as { caret: number };
    expect(last.caret).toBe(200);
  });

  it('draws a peer with its member name and colour, and moves it after a repaint', async () => {
    const { kernel, clock, alice, bob } = await pair();
    bob.replica().moveCaret(3);
    clock.advance(50);
    await kernel.settle([alice.session, bob.session]);
    expect(alice.replica().peers.drawn.map((p) => ({ name: p.name, color: p.color, x: p.view.caret?.rect.x }))).toEqual([{ name: 'Bob', color: '#10B981', x: 0 }]);

    // Bob's caret record is unchanged (the clock has not moved, so no new one is sent); only
    // Alice's text grew under it, and her repaint re-derives where it is.
    bob.replica().type('abc');
    await kernel.settle([alice.session, bob.session]);
    expect(kernel.sentOf('Awareness').filter((r: { cid: bigint }): boolean => r.cid === BOB)).toHaveLength(2);
    expect(alice.replica().peers.drawn.map((p) => p.view.caret?.rect.x)).toEqual([300]);
    expect(alice.peers.at(-1)?.map((p) => p.name)).toEqual(['Bob']);
  });

  it('keeps a quiet peer alive by heartbeat, and forgets one whose session went away', async () => {
    const { kernel, clock, alice, bob } = await pair();
    bob.replica().moveCaret(1);
    await kernel.settle([alice.session, bob.session]);
    for (let s: number = 0; s < 30; s += 1) { clock.advance(1_000); await kernel.settle([alice.session, bob.session]); }
    expect(alice.replica().peers.drawn.map((p) => p.name)).toEqual(['Bob']);

    bob.session.close();
    for (let s: number = 0; s < 30; s += 1) { clock.advance(1_000); await kernel.settle([alice.session]); }
    expect(alice.replica().peers.drawn).toEqual([]);
  });
});
