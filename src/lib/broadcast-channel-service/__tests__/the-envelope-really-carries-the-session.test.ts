/**
 * The `targetCid` stamp, asserted on the envelope the builder actually emits.
 *
 * UI #27 added `targetCid` so a tab signed in as somebody else stops applying
 * the leader's workspace. The incident it closed: a workspace assigned over
 * another session's `initialized`, after which a modal backdrop blacked out the
 * whole app.
 *
 * Two tests already reference the stamp and NEITHER holds it in place:
 *
 *  - `the-sender-names-its-session.test.ts` greps a 600-character window of
 *    `service.ts` for the string `selectedCid`. It never reads
 *    `broadcasting.ts`, which is where the field is put on the message.
 *  - `state-sync-stays-in-its-session.test.ts` hand-builds a `BroadcastMessage`
 *    with `targetCid` already populated and checks the handler gates on it. It
 *    asserts the receiver's behaviour against an envelope production is under
 *    no obligation to produce.
 *
 * Delete `targetCid,` from broadcasting.ts and both stay green while the bug
 * comes back. This test calls the builder and reads what came out.
 */
import { describe, it, expect, vi } from 'vitest';
import { broadcastStateSync } from '../broadcasting';
import type { BroadcastMessage } from '../types';

/** A stand-in for BroadcastChannel that records what was posted. */
function recordingChannel(): { channel: BroadcastChannel; posted: BroadcastMessage[] } {
  const posted: BroadcastMessage[] = [];
  const channel = {
    postMessage: vi.fn((m: BroadcastMessage) => {
      posted.push(m);
    }),
  } as unknown as BroadcastChannel;
  return { channel, posted };
}

describe('the state-sync envelope carries its session', () => {
  it('stamps targetCid onto the message it broadcasts', () => {
    const { channel, posted } = recordingChannel();

    broadcastStateSync(channel, 'tab-1', true, { workspace: 'w' }, 42n);

    expect(posted, 'nothing was broadcast at all').toHaveLength(1);
    expect(
      posted[0].targetCid,
      'the envelope does not name its session, so every tab will apply it — including one signed in as somebody else',
    ).toBe(42n);
  });

  it('still broadcasts when the sender genuinely has no session yet', () => {
    // The control. `targetCid` is optional by design; a fix that made it
    // required would break the pre-login broadcast, and no assertion about the
    // stamp would notice.
    const { channel, posted } = recordingChannel();

    broadcastStateSync(channel, 'tab-1', true, { workspace: 'w' });

    expect(posted).toHaveLength(1);
    expect(posted[0].targetCid).toBeUndefined();
  });

  it('carries the rest of the envelope too', () => {
    const { channel, posted } = recordingChannel();

    broadcastStateSync(channel, 'tab-9', false, { a: 1 }, 7n);

    expect(posted[0].type).toBe('state-sync');
    expect(posted[0].tabId).toBe('tab-9');
    expect(posted[0].isLeader).toBe(false);
  });
});
