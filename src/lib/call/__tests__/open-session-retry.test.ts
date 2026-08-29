import { describe, it, expect } from 'vitest';
import { CONNECT_TIMEOUT_MS } from '../call-constants';
import {
  nextOpenAttempt,
  MAX_OPEN_ATTEMPTS,
  OPEN_RETRY_GAP_MS,
  type OpenRetryDecision,
} from '../open-session-retry';

describe('nextOpenAttempt', () => {
  it('retries a first failure that leaves room in the connect budget', () => {
    const decision: OpenRetryDecision = nextOpenAttempt({
      attemptsMade: 1,
      elapsedMs: 5_000,
      lastAttemptMs: 5_000,
    });
    expect(decision).toEqual({ retry: true, delayMs: OPEN_RETRY_GAP_MS });
  });

  it('stops after the attempt limit even with budget to spare', () => {
    expect(
      nextOpenAttempt({ attemptsMade: MAX_OPEN_ATTEMPTS, elapsedMs: 0, lastAttemptMs: 0 }),
    ).toEqual({ retry: false });
  });

  it('stops when another attempt would land past the connect deadline', () => {
    // The call is declared failed at CONNECT_TIMEOUT_MS regardless, so an
    // attempt that could not finish before then buys the user nothing but a
    // longer wait for the same news.
    const lastAttemptMs: number = 12_000;
    const elapsedMs: number = CONNECT_TIMEOUT_MS - lastAttemptMs;
    expect(nextOpenAttempt({ attemptsMade: 1, elapsedMs, lastAttemptMs })).toEqual({ retry: false });
  });

  it('measures the next attempt by the one that just failed, not a copy of the service constant', () => {
    // Same elapsed time, same attempt count: only the observed duration of the
    // failed attempt decides. A fast failure still has room; a slow one does not.
    const elapsedMs: number = 20_000;
    expect(nextOpenAttempt({ attemptsMade: 1, elapsedMs, lastAttemptMs: 1_000 }).retry).toBe(true);
    expect(nextOpenAttempt({ attemptsMade: 1, elapsedMs, lastAttemptMs: 15_000 }).retry).toBe(false);
  });
});
