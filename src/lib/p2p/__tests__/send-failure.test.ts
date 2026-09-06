/**
 * The agent's send-failure answer must reach a person.
 *
 * Before this, `MessageSendFailure` appeared nowhere in the UI: a message the
 * agent refused stayed `sent` and vanished. Measured against the live avarok
 * server, one session logged 125 refusals while both directions of a
 * conversation showed `sent` and neither arrived.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventEmitter } from '../../event-emitter';
import {
  readSendFailure,
  failureReason,
  reportSendFailure,
  resetSendFailureThrottle,
  REPORT_INTERVAL_MS,
} from '../send-failure';

const FAILURE: Record<string, unknown> = {
  MessageSendFailure: { cid: 7n, message: 'Peer connection for 42 not found', request_id: 'r1' },
};

describe('send failures the agent reports', () => {
  beforeEach(() => resetSendFailureThrottle());

  it('recognises the response, and nothing else', () => {
    expect(readSendFailure(FAILURE)).toEqual(FAILURE.MessageSendFailure);
    expect(readSendFailure({ MessageNotification: { cid: 7n } })).toBeNull();
    expect(readSendFailure({ MessageSendSuccess: { cid: 7n } })).toBeNull();
    expect(readSendFailure(null)).toBeNull();
    expect(readSendFailure('MessageSendFailure')).toBeNull();
  });

  it("keeps the agent's own words, which say more than 'send failed'", () => {
    expect(failureReason({ message: 'Peer connection for 42 not found' })).toBe(
      'Peer connection for 42 not found',
    );
    // A blank reason still has to say something a person can act on.
    expect(failureReason({ message: '  ' })).toMatch(/could not send/i);
    expect(failureReason({})).toMatch(/could not send/i);
  });

  it('emits an event a surface can render', () => {
    const seen: unknown[] = [];
    const off: () => void = eventEmitter.on('p2p:send-failed', (e: unknown) => seen.push(e));
    expect(reportSendFailure({ cid: 7n, message: 'Peer connection for 42 not found' })).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ cid: 7n, reason: 'Peer connection for 42 not found' });
    if (typeof off === 'function') off();
  });

  it('reports once per session per interval — a dead channel produces one per frame', () => {
    const emit = vi.spyOn(eventEmitter, 'emit');
    const t0 = 1_000_000;
    expect(reportSendFailure({ cid: 7n, message: 'x' }, t0)).toBe(true);
    // 124 more, as the live run produced: exactly none of them is reported.
    for (let i = 1; i <= 124; i++) {
      expect(reportSendFailure({ cid: 7n, message: 'x' }, t0 + i * 100)).toBe(false);
    }
    // A different session is a different problem, and is reported.
    expect(reportSendFailure({ cid: 9n, message: 'x' }, t0 + 200)).toBe(true);
    // And the same session is reported again once the interval has passed.
    expect(reportSendFailure({ cid: 7n, message: 'x' }, t0 + REPORT_INTERVAL_MS + 1)).toBe(true);
    const failedEvents: unknown[][] = emit.mock.calls.filter(([name]) => name === 'p2p:send-failed');
    expect(failedEvents).toHaveLength(3);
    emit.mockRestore();
  });
});
