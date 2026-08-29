/**
 * "Remember credentials" has to cover every credential, not the one that was
 * noticed first.
 *
 * The account password was gated on the switch — with a comment recording that
 * it used to be stored unconditionally — while the server pre-shared key on the
 * next line was still stored regardless. That is the worse of the two to leave
 * behind: the PSK admits ANY account to that workspace server, not just this
 * one, and both are written by plain JSON.stringify with no encryption.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleAuthSuccess } from '../session-management';
import type { StoredSession } from '@/types/session-types';

function capture(): { stored: StoredSession[]; state: { addOrUpdateSession: (session: StoredSession) => void; readonly storedSessions: { sessions: StoredSession[]; activeSessionIndex: number; }; setCurrentConnectionInfo: ReturnType<typeof vi.fn>; updateCurrentConnectionInfo: ReturnType<typeof vi.fn>; invalidateCache: ReturnType<typeof vi.fn>; }; io: { storeSessionsToLocalDB: ReturnType<typeof vi.fn>; setSelectedUser: ReturnType<typeof vi.fn>; setWorkspaceConnectionId: ReturnType<typeof vi.fn>; updateConnectionService: ReturnType<typeof vi.fn>; saveRecentServer: ReturnType<typeof vi.fn>; }; } {
  const stored: StoredSession[] = [];
  const state = {
    addOrUpdateSession: (session: StoredSession): void => { stored.push(session); },
    get storedSessions(): { sessions: StoredSession[]; activeSessionIndex: number; } { return { sessions: stored, activeSessionIndex: 0 }; },
    setCurrentConnectionInfo: vi.fn(),
    updateCurrentConnectionInfo: vi.fn(),
    invalidateCache: vi.fn(),
  };
  const io: { storeSessionsToLocalDB: ReturnType<typeof vi.fn>; setSelectedUser: ReturnType<typeof vi.fn>; setWorkspaceConnectionId: ReturnType<typeof vi.fn>; updateConnectionService: ReturnType<typeof vi.fn>; saveRecentServer: ReturnType<typeof vi.fn> } = {
    storeSessionsToLocalDB: vi.fn().mockResolvedValue(undefined),
    setSelectedUser: vi.fn().mockResolvedValue(undefined),
    setWorkspaceConnectionId: vi.fn(),
    updateConnectionService: vi.fn(),
    saveRecentServer: vi.fn(),
  };
  return { stored, state, io };
}

const base: { username: string; password: string; serverAddress: string; serverPassword: string; fullName: string; cid: bigint; securitySettings: undefined; } = {
  username: 'alice',
  password: 'hunter2',
  serverAddress: '127.0.0.1:12349',
  serverPassword: 'the-workspace-psk',
  fullName: 'Alice',
  cid: 42n,
  securitySettings: undefined,
};

describe('storing a session after authentication', () => {
  it('keeps both credentials when the user asked it to', async () => {
    const { stored, state, io } = capture();

    await handleAuthSuccess(
      { ...base, storeCredentials: true } as never,
      state as never,
      io as never,
    );

    expect(stored[0].password).toBe('hunter2');
    expect(stored[0].serverPassword).toBe('the-workspace-psk');
  });

  it('keeps neither when the user declined', async () => {
    const { stored, state, io } = capture();

    await handleAuthSuccess(
      { ...base, storeCredentials: false } as never,
      state as never,
      io as never,
    );

    expect(stored[0].password).toBeUndefined();
    // The one that was still being written. A PSK on disk after the user said
    // "do not remember me" is a credential they did not consent to storing.
    expect(stored[0].serverPassword).toBeUndefined();
  });

  it('still records the session itself, so it stays reclaimable', async () => {
    // Declining to store credentials must not cost the user their session:
    // CIDs are permanent and the navbar claims by CID, not by password.
    const { stored, state, io } = capture();

    await handleAuthSuccess(
      { ...base, storeCredentials: false } as never,
      state as never,
      io as never,
    );

    expect(stored[0].username).toBe('alice');
    expect(stored[0].cid).toBe(42n);
  });
});
