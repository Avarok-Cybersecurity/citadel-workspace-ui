/**
 * A request the user was already told had failed must not be silently re-sent.
 *
 * `sendToLeader` gives up after the ACK timeout and resolves an error — but it
 * never removed the entry from the queue, while the ACK path does call
 * `acknowledge`. `onLeaderChange` replays EVERY queued entry, so a Connect, a
 * workspace mutation or a P2P message that had already surfaced as a failure was
 * re-executed on a later connection, minutes or hours afterwards, and again at
 * every subsequent leader change — because nothing ever removed it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitted: Array<{ event: string; payload: unknown }> = [];
vi.mock('@/lib/event-emitter', () => ({
  eventEmitter: {
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    on: () => () => {},
    off: () => {},
  },
}));

import { outboundQueue } from '@/lib/multi-instance/outbound-queue';

describe('the outbound queue', () => {
  beforeEach(() => {
    emitted.length = 0;
    // Drain anything a previous test left behind.
    for (const id of ['r1', 'r2']) outboundQueue.acknowledge(id, { status: 'error' });
  });

  it('replays a still-pending request when the leader changes', () => {
    outboundQueue.enqueue({ kind: 'Connect' }, 'r1');

    outboundQueue.onLeaderChange('new-leader');

    const retries = emitted.filter((e) => e.event === 'outbound-retry');
    expect(retries).toHaveLength(1);
  });

  it('does NOT replay a request that already failed and was acknowledged', () => {
    outboundQueue.enqueue({ kind: 'Connect' }, 'r2');

    // What the ACK-timeout path must do, and did not: tell the queue the
    // request is finished. Without this the identical payload is re-sent to
    // every future leader, forever.
    outboundQueue.acknowledge('r2', { status: 'error', error: 'Timeout waiting for ACK from leader' });
    emitted.length = 0;

    outboundQueue.onLeaderChange('new-leader');

    expect(emitted.filter((e) => e.event === 'outbound-retry')).toHaveLength(0);
  });
});
