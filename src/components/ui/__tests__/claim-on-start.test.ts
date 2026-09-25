/**
 * Page start resumes what the agent holds: it retries an agent that is not up
 * yet, and it does not adopt a session another browser holds.
 *
 * No mocks: the I/O is injected, and the doubles below are the agent's answers.
 */
import { describe, it, expect } from 'vitest';
import { claimOnStart, type StartClaim, type StartClaimIO, type StartRetry } from '../claim-on-start';
import type { ClaimOutcome } from '@/lib/sessions/claim-session';
import type { ActiveSession } from '@/types/session-types';

const ALICE: ActiveSession = { cid: 7n, username: 'alice0924', server_address: 'work.example.net:12349' } as ActiveSession;
// Test policy: four attempts, so a double that fails the first three still reaches an answer.
const RETRY: StartRetry = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 8000 };

interface Recorded { io: StartClaimIO; sleeps: number[]; selected: ActiveSession[] }

function agent(answers: {
  readyAfter?: number;
  answeredAfter?: number;
  sessions?: ActiveSession[];
  claim?: ClaimOutcome;
}): Recorded {
  let readyCalls: number = 0;
  let queryCalls: number = 0;
  const sleeps: number[] = [];
  const selected: ActiveSession[] = [];
  const io: StartClaimIO = {
    ready: async (): Promise<boolean> => ++readyCalls > (answers.readyAfter ?? 0),
    activeSessions: async (): Promise<{ ok: boolean; sessions: ActiveSession[] }> =>
      ++queryCalls > (answers.answeredAfter ?? 0)
        ? { ok: true, sessions: answers.sessions ?? [ALICE] }
        : { ok: false, sessions: [] },
    selection: async (): Promise<null> => null,
    clearSelection: async (): Promise<void> => {},
    select: async (s: ActiveSession): Promise<void> => { selected.push(s); },
    claim: async (): Promise<ClaimOutcome> => answers.claim ?? { status: 'claimed' },
    sleep: async (ms: number): Promise<void> => { sleeps.push(ms); },
  };
  return { io, sleeps, selected };
}

describe('resuming at page start', () => {
  it('retries, with backoff, an agent whose socket failed on the first try', async () => {
    const a: Recorded = agent({ readyAfter: 2 });
    const result: StartClaim = await claimOnStart(a.io, RETRY);
    expect(result).toEqual({ kind: 'claimed', cid: 7n });
    expect(a.sleeps).toEqual([1000, 2000]);
    expect(a.selected).toEqual([ALICE]);
  });

  it('retries a session query that went unanswered instead of concluding "no sessions"', async () => {
    const a: Recorded = agent({ answeredAfter: 1 });
    expect(await claimOnStart(a.io, RETRY)).toEqual({ kind: 'claimed', cid: 7n });
  });

  it('says the agent was unreachable only after every attempt', async () => {
    const a: Recorded = agent({ readyAfter: 99 });
    expect(await claimOnStart(a.io, RETRY)).toEqual({ kind: 'agent-unreachable' });
    expect(a.sleeps).toHaveLength(RETRY.maxAttempts - 1);
    expect(a.selected).toEqual([]);
  });

  it('does not adopt a session another browser holds, and names whose it is', async () => {
    const a: Recorded = agent({ claim: { status: 'held-by-another-connection' } });
    expect(await claimOnStart(a.io, RETRY)).toEqual({ kind: 'held-by-another-connection', username: 'alice0924' });
    expect(a.selected).toEqual([]);
  });

  it('reports an answered empty list as nothing to claim', async () => {
    expect(await claimOnStart(agent({ sessions: [] }).io, RETRY)).toEqual({ kind: 'nothing-to-claim' });
  });
});
