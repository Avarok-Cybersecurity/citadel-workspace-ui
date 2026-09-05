/**
 * Boot must not pay one round trip per conversation, in series.
 *
 * Every `loadMetadataByKey` is a request to the agent, and on a follower tab a BroadcastChannel
 * hop to the leader and back on top of that. Awaiting them one at a time put N latencies on the
 * path to a usable workspace — the same path a new member watches as "Loading workspace...".
 *
 * These tests pin the two properties that matter and would otherwise drift apart: the reads
 * overlap, and the result is still exactly what the serial version produced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const keys: string[] = Array.from({ length: 20 }, (_, i) => `p2p_conv_${i}_metadata`);
let inFlight = 0;
let peakInFlight = 0;
const started: string[] = [];

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendLocalDBListKeys: async (): Promise<string[]> => keys,
  },
}));
vi.mock('../message-page-operations', () => ({
  loadMetadataByKey: async (key: string) => {
    started.push(key);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
    return { peerCid: key.replace(/\D/g, ''), messageCount: 1 };
  },
}));
vi.mock('@/lib/multi-instance', () => ({ instanceManager: { cid: null } }));
vi.mock('@/lib/debug-config', () => ({ debugLog: (): void => {} }));

import { loadAllMetadata } from '../load-all-metadata';

describe('boot loads conversations in parallel', () => {
  beforeEach(() => {
    inFlight = 0;
    peakInFlight = 0;
    started.length = 0;
  });

  it('overlaps the reads instead of awaiting them one at a time', async () => {
    await loadAllMetadata();
    expect(peakInFlight, 'the reads ran strictly one after another').toBeGreaterThan(1);
  });

  it('keeps the queue bounded rather than firing every key at once', async () => {
    await loadAllMetadata();
    expect(peakInFlight, 'an unbounded burst moves the queue to the agent rather than removing it')
      .toBeLessThanOrEqual(8);
  });

  it('returns every conversation, in key order', async () => {
    const result = await loadAllMetadata();
    expect(result).toHaveLength(keys.length);
    expect(result.map((m) => (m as { peerCid: string }).peerCid)).toEqual(
      keys.map((k) => k.replace(/\D/g, '')),
    );
  });

  it('finishes in well under the serial time', async () => {
    const started_at = Date.now();
    await loadAllMetadata();
    const elapsed = Date.now() - started_at;
    // 20 reads × 10ms serial = 200ms; eight at a time should be nearer 30ms.
    expect(elapsed, `took ${elapsed}ms, which is the serial cost`).toBeLessThan(150);
  });
});
