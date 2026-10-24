/**
 * A glue app's in-page call is gated exactly as a worker's: an op its grant does not cover never
 * reaches the port, though the port is bound.
 */
import { describe, expect, it } from 'vitest';
import type { Capability } from '../capabilities';
import { glueInstance, type GlueInstance } from '../glue-instance';
import { fakeNodes, type Recorder } from './fakes';

describe('a glue instance', () => {
  it('refuses an ungranted call in the page without touching the port (control: a granted one reaches it)', async () => {
    const rec: Recorder = { calls: [] };
    const glue: GlueInstance = glueInstance({ nodes: fakeNodes(rec) }, new Set<Capability>(['nodes.read']));
    expect(glue.call('nodes', 4, { parent_id: 'n1', name: 'x' })).toEqual({ refused: 'ungranted' });
    expect(rec.calls).toEqual([]);
    expect(await glue.call('nodes', 1, { node_id: 'n1' })).toMatchObject({ ok: { node_id: 'n1', name: 'Board' } });
    expect(rec.calls.map((c) => c.method)).toEqual(['NodeGet']);
  });
});
