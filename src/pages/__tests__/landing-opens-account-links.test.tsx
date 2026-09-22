import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ActiveSession } from '@/types/session-types';

/**
 * The landing page's wiring of an account link: read once, cleared from the
 * URL, and routed to the shared session switch or to pre-filled sign-in.
 *
 * MOCKS, and why: `@/lib/connection` is the agent's WebSocket, which a unit
 * test does not have; `switchToSession` is the claim sequence over that same
 * socket, and is recorded rather than run. The parser, the matching and the
 * hook are the real code.
 */
const agent: { sessions: ActiveSession[] } = { sessions: [] };
vi.mock('@/lib/connection', () => ({
  connectionManager: {
    waitForReady: async (): Promise<void> => {},
    getActiveSessionsResult: async (): Promise<{ ok: boolean; sessions: ActiveSession[] }> => ({ ok: true, sessions: agent.sessions }),
    getStoredSessions: (): { sessions: never[] } => ({ sessions: [] }),
  },
}));

const switched: bigint[] = [];
vi.mock('@/lib/sessions/switch-to-session', () => ({
  switchToSession: async (session: { cid: bigint }): Promise<void> => { switched.push(session.cid); },
}));

import { useAccountLink } from '../use-account-link';

function run(url: string): { login: string[]; location: () => string } {
  const login: string[] = [];
  let search: string = '';
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  renderHook(() => {
    useAccountLink((username: string) => { login.push(username); });
    search = useLocation().search;
  }, { wrapper });
  return { login, location: () => search };
}

const alice: ActiveSession = { cid: 7n, username: 'alice', server_address: 'citadel.example.com:12400' };

describe('the landing page and an account link', () => {
  beforeEach(() => {
    agent.sessions = [];
    switched.length = 0;
  });

  it('switches to a matching live session, and clears the link', async () => {
    agent.sessions = [alice];
    const { login, location } = run('/?account=alice&server=citadel.example.com');
    await waitFor(() => expect(switched).toEqual([7n]));
    expect(login).toEqual([]);
    expect(location()).toBe('');
  });

  it('opens pre-filled sign-in when nothing matches', async () => {
    agent.sessions = [alice];
    const link: string = encodeURIComponent('web+citadel://open?account=bob');
    const { login, location } = run(`/?link=${link}`);
    await waitFor(() => expect(login).toEqual(['bob']));
    expect(switched).toEqual([]);
    expect(location()).toBe('');
  });

  it('clears a malformed link and does nothing else', async () => {
    agent.sessions = [alice];
    const { login, location } = run('/?account=alice&next=/admin');
    // Only the link's own keys are removed; `next` is not read by anything.
    await waitFor(() => expect(location()).toBe('?next=%2Fadmin'));
    // Let the (mocked, immediately-resolving) session query settle, so an
    // absence below is an outcome rather than a race that has not run yet.
    await act(async (): Promise<void> => { await new Promise<void>((r: () => void) => setTimeout(r, 20)); });
    expect(login).toEqual([]);
    expect(switched).toEqual([]);
  });
});
