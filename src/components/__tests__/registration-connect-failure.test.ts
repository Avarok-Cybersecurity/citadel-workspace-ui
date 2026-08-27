/**
 * With connect_after_register the internal service re-dispatches a Connect under
 * the SAME request_id, so its failure arrives as a TOP-LEVEL ConnectFailure —
 * the sibling of the top-level ConnectSuccess that was always handled. Only the
 * `Response`-wrapped form was matched, so a registration that SUCCEEDED and
 * whose connect failed fell through to the 30s timeout and reported
 * "Registration timed out". The user then retried and was told the username
 * already exists, for an account they did not know they owned.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRegistrationResponseHandler } from '../registration-response-handler';

const REQ = 'req-1';

function harness() {
  const resolve = vi.fn();
  const reject = vi.fn();
  const cleanup = vi.fn();
  const handler = createRegistrationResponseHandler(REQ, resolve, reject, cleanup, {
    handleConnectSuccess: async (_p, res) => res({ cid: '42' }),
    setShowNotInitializedModal: vi.fn(),
  });
  return { handler, resolve, reject, cleanup };
}

describe('the registration response handler', () => {
  it('settles on a TOP-LEVEL ConnectFailure instead of waiting out the timeout', () => {
    const { handler, reject, cleanup } = harness();

    handler({ ConnectFailure: { request_id: REQ, message: 'peer refused' } });

    expect(reject).toHaveBeenCalledOnce();
    expect((reject.mock.calls[0][0] as Error).message).toBe('peer refused');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('says the account exists when the service gives no reason', () => {
    const { handler, reject } = harness();

    handler({ ConnectFailure: { request_id: REQ } });

    // Silence here previously became "Registration timed out", which is the
    // opposite of what happened: the account was created.
    expect((reject.mock.calls[0][0] as Error).message).toMatch(/account was created/i);
  });

  it('still settles on the Response-wrapped ConnectFailure', () => {
    const { handler, reject } = harness();

    handler({ Response: { ConnectFailure: { request_id: REQ, message: 'wrapped' } } });

    expect((reject.mock.calls[0][0] as Error).message).toBe('wrapped');
  });

  it('ignores a ConnectFailure belonging to a different request', () => {
    const { handler, reject, resolve } = harness();

    handler({ ConnectFailure: { request_id: 'someone-else', message: 'not mine' } });

    expect(reject).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('still resolves on a top-level ConnectSuccess', async () => {
    const { handler, resolve } = harness();

    handler({ ConnectSuccess: { request_id: REQ, cid: '42' } });
    await Promise.resolve();

    expect(resolve).toHaveBeenCalledWith({ cid: '42' });
  });
});
