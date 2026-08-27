/**
 * `connect()` must always send Connect. Every time, with the credentials.
 *
 * It used to look up the agent's active sessions by USERNAME alone and, when
 * the local store held no matching CID, claim the session and return — without
 * sending anything. The password the user typed was used by nobody: not here,
 * not by the agent (whose own reuse branch did not check it either), and not by
 * the server, which was never asked.
 *
 * That is the same defect removed from `useLoginHandler` one layer up. Its
 * comment says the decision belongs where it can actually be made; this is what
 * stopped it from being made at all — the repo's own
 * fixes-that-were-never-propagated pattern, on a security check.
 *
 * It also broke the login it silently completed: the claim carries its own
 * request id, so the caller waiting on ITS id waited out 30 seconds and
 * reported a connection timeout for a login that had in fact happened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendRequest = vi.fn().mockResolvedValue(undefined);
const claimSession = vi.fn().mockResolvedValue(undefined);
const disconnect = vi.fn().mockResolvedValue(undefined);
const getActiveSessions = vi.fn();

vi.mock('../../connection', () => ({
  connectionManager: {
    getActiveSessions: () => getActiveSessions(),
    getStoredSessions: () => ({ sessions: [] }),
  },
}));

const { AuthOperations } = await import('../auth-operations');

function operations() {
  return new AuthOperations({
    init: vi.fn().mockResolvedValue(undefined),
    sendRequest,
    claimSession,
    disconnect,
  } as never);
}

describe('connect', () => {
  beforeEach(() => {
    sendRequest.mockClear();
    claimSession.mockClear();
    disconnect.mockClear();
    // The state that used to trigger the front-run: a live session for this
    // username that the local store does not know the CID of.
    getActiveSessions.mockResolvedValue([{ username: 'alice', cid: 42n, server_address: 'x' }]);
  });

  it('sends Connect even when a session for that username is already live', async () => {
    await operations().connect('req-1', 'alice', 'hunter2');

    expect(sendRequest).toHaveBeenCalled();
  });

  it('does not claim the session behind the server’s back', async () => {
    await operations().connect('req-1', 'alice', 'hunter2');

    // Claiming here is what skipped authentication entirely.
    expect(claimSession).not.toHaveBeenCalled();
  });

  it('does not tear down a live session on an unauthenticated request', async () => {
    // The other branch disconnected first — destroying a working session on the
    // strength of a request that had proved nothing but knowing a username.
    await operations().connect('req-1', 'alice', 'hunter2');

    expect(disconnect).not.toHaveBeenCalled();
  });

  it('carries the caller’s request id, so the answer can be matched', async () => {
    // The claim used its own id, so the caller's 30s wait for ConnectSuccess /
    // ConnectFailure / SessionAlreadyActive could never be satisfied.
    await operations().connect('req-1', 'alice', 'hunter2');

    // The id is passed alongside the request as well as embedded in it; either
    // is enough for the caller to match its own answer.
    expect(sendRequest.mock.calls[0][1]).toBe('req-1');
  });
});
