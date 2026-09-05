/**
 * One pending retry per peer, not one per poll cycle.
 *
 * `connectToPeer` schedules a retry and stores it via `setConnectionAttempt`,
 * but it calls `removePendingConnection` BEFORE scheduling — so the
 * `hasPendingConnection` guard meant to stop a second attempt is already open
 * when the 30s poll comes round. The poll re-enters, schedules another retry,
 * and `setConnectionAttempt` overwrote the handle without cancelling it. Every
 * cycle started a chain that never ended.
 *
 * With 15 offline peers and a tab open an hour that is roughly 1,800 live
 * timers, each firing a `connectToPeer` that reads the current CID from
 * IndexedDB and can open a real connection to an offline peer against the
 * SDK's 30s timeout.
 *
 * `deleteConnectionAttempt` already clears correctly — but it is only reached
 * from `cancelRetry` on success, which is the one path an offline peer never
 * takes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { P2PConnectionState } from '../tracking';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const PEER = 7n;

describe('a retry does not outlive its replacement', () => {
  it('cancels the timer it replaces', () => {
    const state = new P2PConnectionState();
    const fired: string[] = [];

    const first = setTimeout(() => fired.push('first'), 1000);
    state.setConnectionAttempt(PEER, { attempts: 1, timeout: first });

    const second = setTimeout(() => fired.push('second'), 1000);
    state.setConnectionAttempt(PEER, { attempts: 2, timeout: second });

    vi.advanceTimersByTime(5000);

    expect(
      fired,
      'the replaced retry still fired, so each poll cycle leaves a chain behind',
    ).toEqual(['second']);
  });

  it('leaves exactly one pending timer after many poll cycles', () => {
    const state = new P2PConnectionState();
    let fires = 0;

    for (let cycle = 0; cycle < 20; cycle++) {
      const t = setTimeout(() => { fires += 1; }, 1000);
      state.setConnectionAttempt(PEER, { attempts: cycle, timeout: t });
    }

    vi.advanceTimersByTime(5000);

    expect(fires, `20 poll cycles left ${fires} live retries instead of 1`).toBe(1);
  });

  it('does not cancel a timer that is being re-stored unchanged', () => {
    // The control. A blanket clear would kill the timer the caller is keeping,
    // and no assertion about leaks would notice.
    const state = new P2PConnectionState();
    let fired = false;

    const t = setTimeout(() => { fired = true; }, 1000);
    state.setConnectionAttempt(PEER, { attempts: 1, timeout: t });
    state.setConnectionAttempt(PEER, { attempts: 2, timeout: t });

    vi.advanceTimersByTime(5000);

    expect(fired, 'the surviving timer was cancelled by its own re-store').toBe(true);
  });
});
