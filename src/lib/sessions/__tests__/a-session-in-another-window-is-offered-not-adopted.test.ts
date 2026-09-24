/**
 * Switching to an account that is live in another browser window asks first.
 *
 * `claimSessionForThisTab` answered "not orphaned, no tab of ours holds it"
 * with `already-active`, and the switch went on to select a session this tab's
 * socket does not carry: the workspace sat there and nothing ever answered.
 * The agent refuses `ClaimSession { only_if_orphaned: false }` for a session
 * held by another connection ("in use by another connection"), so the only
 * takeover is a sign-in with the password. The switch now says so and offers it.
 *
 * Mocked: the agent's ClaimSession answers, and the session-selection I/O the
 * switch would run after a successful claim.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h: { holder: 'orphan' | 'this-connection' | 'another-connection'; claims: boolean[]; selected: number } = vi.hoisted(
  (): { holder: 'orphan' | 'this-connection' | 'another-connection'; claims: boolean[]; selected: number } =>
    ({ holder: 'another-connection', claims: [], selected: 0 }),
);

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    claimSession: vi.fn(async (cid: bigint, onlyIfOrphaned: boolean): Promise<void> => {
      h.claims.push(onlyIfOrphaned);
      if (h.holder === 'orphan') return;
      if (onlyIfOrphaned) throw new Error(`Session ${cid} is not orphaned`);
      if (h.holder === 'another-connection') throw new Error(`Session ${cid} is in use by another connection`);
    }),
  },
}));
vi.mock('@/lib/tab-context', () => ({
  setSelectedUser: vi.fn(async (): Promise<void> => { h.selected += 1; }),
}));

import { claimSessionForThisTab, takeoverPrompt } from '../claim-session';
import { switchToSession } from '../switch-to-session';

beforeEach(() => { h.claims = []; h.selected = 0; });

describe('claiming a session somebody holds', () => {
  it('reports another connection, having moved nothing', async () => {
    h.holder = 'another-connection';
    expect(await claimSessionForThisTab(7n)).toEqual({ status: 'held-by-another-connection' });
  });

  it('still selects a session this connection already holds', async () => {
    h.holder = 'this-connection';
    expect(await claimSessionForThisTab(7n)).toEqual({ status: 'already-active' });
  });

  it('claims an orphan outright, asking only once', async () => {
    h.holder = 'orphan';
    expect(await claimSessionForThisTab(7n)).toEqual({ status: 'claimed' });
    expect(h.claims).toEqual([true]);
  });
});

describe('switching to it', () => {
  const target: Parameters<typeof switchToSession>[0] = {
    cid: 7n, username: 'alice0924', server_address: 'wss://bench.work.avarok.net/', workspaceName: 'Bench', storedSessionIndex: -1,
  };

  it('asks, and on yes starts the sign-in that moves it', async () => {
    h.holder = 'another-connection';
    const confirm = vi.fn(async (): Promise<boolean> => true);
    const signInAs = vi.fn();
    await switchToSession(target, { navigate: vi.fn(), toast: vi.fn(), confirm, signInAs });

    expect(confirm).toHaveBeenCalledWith(takeoverPrompt('alice0924'));
    expect(takeoverPrompt('alice0924').title).toBe('alice0924 is open in another browser window');
    expect(signInAs).toHaveBeenCalledWith('alice0924');
    expect(h.selected).toBe(0);
  });

  it('does nothing further on no', async () => {
    h.holder = 'another-connection';
    const signInAs = vi.fn();
    await switchToSession(target, { navigate: vi.fn(), toast: vi.fn(), confirm: async (): Promise<boolean> => false, signInAs });
    expect(signInAs).not.toHaveBeenCalled();
    expect(h.selected).toBe(0);
  });
});
