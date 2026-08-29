/**
 * A local storage timeout must not discard a completed authentication.
 *
 * `handleAuthSuccess` protects three local writes with explicit comments —
 * `saveRecentServer`, `markLastAccessed` and `setSelectedUser` each say that a
 * storage failure must not abort the auth flow. The fourth, `storeSession`,
 * rethrew, and it is the one that actually times out: CI shows
 * `LocalDBSetKV request timed out` reaching the Join page as
 * **"Registration Error"**.
 *
 * By then the account exists on the server and the credentials were accepted.
 * The connection information is set AFTER the write, so throwing there means
 * the app never learns it is connected — and the user's retry meets "username
 * already taken".
 */
import { describe, it, expect, vi } from 'vitest';
import { handleAuthSuccess, storeSession } from '../session-management';
import type { StoredSession } from '@/types/session-types';

function harness(storeFails: boolean) {
  const state = {
    storedSessions: { sessions: [] as StoredSession[] },
    addOrUpdateSession: vi.fn(),
    setCurrentConnectionInfo: vi.fn(),
    updateCurrentConnectionInfo: vi.fn(),
    setStoredSessions: vi.fn(),
    removeSession: vi.fn(),
  };
  const io: { storeSessionsToLocalDB: ReturnType<typeof vi.fn>; loadSessionsFromLocalDB: ReturnType<typeof vi.fn>; setSelectedUser: ReturnType<typeof vi.fn>; setWorkspaceConnectionId: ReturnType<typeof vi.fn>; updateConnectionService: ReturnType<typeof vi.fn> } = {
    storeSessionsToLocalDB: vi.fn(async () => {
      if (storeFails) throw new Error('LocalDBSetKV request timed out');
    }),
    loadSessionsFromLocalDB: vi.fn(async () => null),
    setSelectedUser: vi.fn(async () => {}),
    setWorkspaceConnectionId: vi.fn(),
    updateConnectionService: vi.fn(),
  };
  return { state, io };
}

const params: { username: string; password: string; serverAddress: string; fullName: string; cid: bigint; storeCredentials: boolean; securitySettings: undefined; serverPassword: undefined; } = {
  username: 'alice',
  password: 'pw',
  serverAddress: '127.0.0.1:12349',
  fullName: 'Alice',
  cid: 42n,
  storeCredentials: false,
  securitySettings: undefined,
  serverPassword: undefined,
};

describe('when the session cannot be written to LocalDB', () => {
  it('still tells the app it is connected', async () => {
    const { state, io } = harness(true);
    await handleAuthSuccess(
      params as never,
      state as never,
      io as never,
    );
    // The three calls that establish the live session, all of which sit AFTER
    // the write and none of which ran when it threw.
    expect(state.setCurrentConnectionInfo).toHaveBeenCalled();
    expect(io.setWorkspaceConnectionId).toHaveBeenCalledWith(42n);
    expect(io.updateConnectionService).toHaveBeenCalled();
  });

  it('does not reject, so registration is not reported as failed', async () => {
    const { state, io } = harness(true);
    await expect(
      handleAuthSuccess(params as never, state as never, io as never),
    ).resolves.toBeUndefined();
  });

  it('keeps the session in memory, which is what makes losing the write safe', async () => {
    const { state, io } = harness(true);
    const ok: boolean = await storeSession({ username: 'alice' } as StoredSession, state as never, io as never);
    expect(state.addOrUpdateSession).toHaveBeenCalled();
    expect(ok).toBe(false);
  });

  it('reports success when the write does land', async () => {
    // The positive control: same call, working storage, opposite return. Without
    // it "false" could be a constant.
    const { state, io } = harness(false);
    expect(
      await storeSession({ username: 'alice' } as StoredSession, state as never, io as never),
    ).toBe(true);
  });
});
