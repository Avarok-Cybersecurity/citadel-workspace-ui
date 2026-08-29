import { CONNECT_TIMEOUT_MS } from './call-constants';

/**
 * Whether a failed media-session open is worth another try, and how long to
 * wait first.
 *
 * The service's open ends after a fixed wait for the peer's UDP channel and
 * says so in as many words -- "it may still be negotiating (retry shortly)" --
 * and, crucially, PARKS the receiver so a second open awaits the same channel
 * rather than starting over. That half was built and nothing ever called it:
 * one attempt failed and the call was declared dead, showing the user a
 * sentence of protocol text telling them to retry, with no way to.
 *
 * Every other open failure is retried too, deliberately. A peer that genuinely
 * withdrew its UDP offer fails again a second later and the user is told the
 * same true thing a little later; the alternative is matching on the service's
 * prose, which makes two copies of one fact and keeps neither in step.
 *
 * The budget is the connect deadline: retrying past the moment the call is
 * declared failed anyway buys nothing. The next attempt is assumed to take
 * about as long as the one that just failed -- measured rather than assumed,
 * because the service owns that duration and a copy of it here would be a
 * second authority for it.
 */
export const MAX_OPEN_ATTEMPTS: 4 = 4;

/** Long enough that a retry is not a busy-loop, short enough to fit four. */
export const OPEN_RETRY_GAP_MS: 750 = 750;

export interface OpenAttemptOutcome {
  /** Attempts already made, including the one that just failed. */
  attemptsMade: number;
  /** Since the first attempt began. */
  elapsedMs: number;
  /** How long the attempt that just failed took. */
  lastAttemptMs: number;
}

export type OpenRetryDecision = { retry: true; delayMs: number } | { retry: false };

export function nextOpenAttempt(outcome: OpenAttemptOutcome): OpenRetryDecision {
  if (outcome.attemptsMade >= MAX_OPEN_ATTEMPTS) return { retry: false };
  const wouldFinishAt: number = outcome.elapsedMs + OPEN_RETRY_GAP_MS + outcome.lastAttemptMs;
  if (wouldFinishAt > CONNECT_TIMEOUT_MS) return { retry: false };
  return { retry: true, delayMs: OPEN_RETRY_GAP_MS };
}
