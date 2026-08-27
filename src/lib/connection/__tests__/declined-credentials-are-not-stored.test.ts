/**
 * "Remember Credentials" has to actually decide whether the password is kept.
 *
 * The switch existed on the login form and was read into component state, and
 * that is where it stopped: `handleAuthSuccess` wrote `password` into the stored
 * session unconditionally. On a product whose pitch is that the user controls
 * their own data, declining credential storage still wrote the password to
 * LocalDB — where auto-reconnect then silently reused it to re-authenticate.
 *
 * The storage layer is injected, so these drive the real function and assert on
 * what it hands the IO router.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleAuthSuccess } from '../session-management';
import type { ConnectionState } from '../state';
import type { ConnectionIO } from '../io';
import type { AuthSuccessParams } from '../types';
import type { StoredSessions } from '@/types/session-types';

function setup() {
  const stored: StoredSessions = { sessions: [] };
  const written: StoredSessions[] = [];
  const io = {
    storeSessionsToLocalDB: vi.fn((s: StoredSessions) => {
      written.push(structuredClone(s));
      return Promise.resolve();
    }),
    setSelectedUser: vi.fn(() => Promise.resolve()),
    setTabContext: vi.fn(() => Promise.resolve()),
    setWorkspaceConnectionId: vi.fn(),
    updateConnectionService: vi.fn(),
  } as unknown as ConnectionIO;
  const state = {
    storedSessions: stored,
    setStoredSessions: vi.fn(),
    setCurrentConnectionInfo: vi.fn(),
    addOrUpdateSession: vi.fn((session: StoredSessions['sessions'][number]) => {
      const i = stored.sessions.findIndex(s => s.username === session.username);
      if (i === -1) stored.sessions.push(session);
      else stored.sessions[i] = session;
    }),
  } as unknown as ConnectionState;
  return { io, state, written };
}

function params(storeCredentials: boolean): AuthSuccessParams {
  return {
    username: 'alice',
    password: 'hunter2',
    fullName: 'Alice',
    serverAddress: '127.0.0.1:12349',
    serverPassword: '',
    securitySettings: {} as AuthSuccessParams['securitySettings'],
    cid: 1n,
    storeCredentials,
  };
}

describe('handleAuthSuccess credential storage', () => {
  it('keeps the password when the user asked it to', async () => {
    const { io, state, written } = setup();
    await handleAuthSuccess(params(true), state, io);

    const session = written.at(-1)?.sessions.find(s => s.username === 'alice');
    expect(session).toBeDefined();
    expect(session!.password).toBe('hunter2');
  });

  it('does not write the password when the user declined', async () => {
    const { io, state, written } = setup();
    await handleAuthSuccess(params(false), state, io);

    const session = written.at(-1)?.sessions.find(s => s.username === 'alice');
    expect(session).toBeDefined();
    // The session itself is still stored — the user is signed in, and orphan
    // reclaim and the server list both need the record. Only the secret is
    // withheld.
    expect(session!.username).toBe('alice');
    expect(session!.password).toBeUndefined();

    // And it is nowhere else in the record either: a password copied into
    // another field would defeat the whole thing. Walked rather than
    // JSON.stringify'd, which throws on the bigint cid.
    const values: unknown[] = [];
    const walk = (v: unknown): void => {
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
      else values.push(v);
    };
    walk(written.at(-1));
    expect(values).not.toContain('hunter2');
  });
});
