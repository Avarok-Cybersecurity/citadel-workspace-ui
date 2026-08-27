/**
 * A request received is not a relationship established.
 *
 * `handlePeerRegisterNotification` — which fires when someone sends US a
 * registration request — set `isRegistered = true` and added the sender to
 * `registeredPeers`, before any accept. The backend defines registered as
 * mutual: `list_registered` answers from `GetMutuals`.
 *
 * That was not cosmetic. `MessageSender` checks `isPeerRegistered` and skips
 * registration when it is true, so a first message to someone whose request was
 * merely pending went out against a peer with no mutual registration and no
 * ratchet, and failed. The peer also appeared among the user's connections
 * before they had agreed to anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebSocketMessage } from '../registration';
import type { Peer } from '../types';

function context() {
  return {
    pendingRequests: new Map(),
    allPeers: new Map<bigint, Peer>(),
    registeredPeers: new Map<bigint, Peer>(),
    outgoingRegistrations: new Set<bigint>(),
    incomingRegistrations: new Set<bigint>(),
    handleIncomingRegistration: vi.fn(() => Promise.resolve()),
  };
}

/** Delivered through the real entry point, as the socket would. */
function deliverRequest(ctx: ReturnType<typeof context>) {
  handleWebSocketMessage({ PeerRegisterNotification: notification } as never, ctx as never);
}

const notification = {
  cid: 7n,
  peer_cid: 42n,
  peer_username: 'alice',
  request_id: 'req-1',
};

let ctx: ReturnType<typeof context>;

beforeEach(() => {
  ctx = context();
});

describe('an incoming registration request', () => {
  it('does not claim the sender is registered', () => {
    deliverRequest(ctx);

    expect(ctx.registeredPeers.has(42n)).toBe(false);
    expect(ctx.allPeers.get(42n)?.isRegistered).toBe(false);
  });

  it('still learns the sender, so the request shows a name not a CID', () => {
    deliverRequest(ctx);

    expect(ctx.allPeers.get(42n)?.username).toBe('alice');
  });

  it('still runs the pending-request flow', () => {
    deliverRequest(ctx);

    expect(ctx.handleIncomingRegistration).toHaveBeenCalledWith(7n, 42n, 'alice');
  });

  it('does not downgrade a peer who IS already mutually registered', () => {
    // A second request from someone already registered — a resend, which the
    // sender does every five minutes — must not un-register them.
    const existing: Peer = {
      cid: 42n,
      username: 'alice',
      fullName: 'Alice',
      isOnline: true,
      isRegistered: true,
    };
    ctx.allPeers.set(42n, existing);
    ctx.registeredPeers.set(42n, existing);

    deliverRequest(ctx);

    expect(ctx.registeredPeers.has(42n)).toBe(true);
    expect(ctx.allPeers.get(42n)?.isRegistered).toBe(true);
  });
});
