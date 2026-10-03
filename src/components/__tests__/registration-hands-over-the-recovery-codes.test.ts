/**
 * RegisterSuccess carries the new account's recovery codes and arrives ahead
 * of the connect's own answer, under the same request id. The codes are handed
 * to the caller -- to show once -- and the wait goes on: RegisterSuccess is not
 * the outcome, ConnectSuccess is. Both wire shapes, as the sibling tests do.
 *
 * No doubles: the handler is driven directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRegistrationResponseHandler } from '../registration-response-handler';

const REQ: 'req-1' = 'req-1';
const CODES: string[] = ['CODE-0001', 'CODE-0002'];

function harness(): { handler: (raw: unknown) => void; resolve: ReturnType<typeof vi.fn>; cleanup: ReturnType<typeof vi.fn>; codes: ReturnType<typeof vi.fn> } {
  const resolve: ReturnType<typeof vi.fn> = vi.fn();
  const cleanup: ReturnType<typeof vi.fn> = vi.fn();
  const codes: ReturnType<typeof vi.fn> = vi.fn();
  const handler: (raw: unknown) => void = createRegistrationResponseHandler(REQ, resolve, vi.fn(), cleanup, {
    handleConnectSuccess: async (payload, res) => { res({ cid: String(payload.cid) }); },
    setShowNotInitializedModal: vi.fn(),
    onRecoveryCodes: codes,
  });
  return { handler, resolve, cleanup, codes };
}

describe('the recovery codes in RegisterSuccess', () => {
  it('reach the caller, and the registration waits for the connect answer', async () => {
    const { handler, resolve, cleanup, codes } = harness();
    handler({ RegisterSuccess: { cid: 9n, request_id: REQ, recovery_codes: CODES } });
    await Promise.resolve();
    expect(codes).toHaveBeenCalledExactlyOnceWith(CODES);
    expect(resolve).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();

    handler({ ConnectSuccess: { cid: 9n, request_id: REQ } });
    await Promise.resolve();
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ cid: '9' });
  });

  it('are read from the Response-wrapped shape too', () => {
    const { handler, codes } = harness();
    handler({ Response: { RegisterSuccess: { cid: 9n, request_id: REQ, recovery_codes: CODES } } });
    expect(codes).toHaveBeenCalledExactlyOnceWith(CODES);
  });

  it('are not taken from another registration', () => {
    const { handler, codes } = harness();
    handler({ RegisterSuccess: { cid: 9n, request_id: 'someone-else', recovery_codes: CODES } });
    expect(codes).not.toHaveBeenCalled();
  });
});
