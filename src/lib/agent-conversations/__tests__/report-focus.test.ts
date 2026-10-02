/**
 * The agent holds back a native notice for what this window shows; it learns
 * that from ReportFocus, sent when it changes and only to an agent that hosts.
 */
import { describe, it, expect } from 'vitest';
import { createFocusReporter, type FocusDeps } from '../report-focus';

type Said = { session_cid: bigint; peer_cid: bigint | null; focused: boolean };

function rig(hosts: boolean): { deps: FocusDeps; said: Said[]; state: { front: boolean; peer: bigint | null } } {
  const said: Said[] = [];
  const state: { front: boolean; peer: bigint | null } = { front: true, peer: null };
  const deps: FocusDeps = {
    hosts: async () => hosts,
    ownCid: async () => 7n,
    activePeer: () => state.peer,
    inFront: () => state.front,
    send: async (request: Record<string, unknown>) => {
      const command: { ReportFocus: Said } = (request.ConnectionManagement as { management_command: { ReportFocus: Said } }).management_command;
      said.push(command.ReportFocus);
    },
  };
  return { deps, said, state };
}

describe('reporting focus', () => {
  it('says what is in front when it changes, and only then', async () => {
    const { deps, said, state } = rig(true);
    const report: () => Promise<void> = createFocusReporter(deps);
    await report();
    await report();
    state.peer = 9n;
    await report();
    state.front = false;
    await report();
    expect(said).toEqual([
      { session_cid: 7n, peer_cid: null, focused: true },
      { session_cid: 7n, peer_cid: 9n, focused: true },
      { session_cid: 7n, peer_cid: null, focused: false },
    ]);
  });

  it('says nothing to an agent that raises no notices', async () => {
    const { deps, said } = rig(false);
    await createFocusReporter(deps)();
    expect(said).toEqual([]);
  });
});
