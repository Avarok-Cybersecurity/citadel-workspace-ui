/**
 * A call survives the leader tab closing or reloading.
 *
 * The agent binds a media session to the connection that opened it. A new
 * leader opens a new connection, so the call -- untouched in its own tab --
 * kept sending into sessions whose inbound frames went to a dead socket. Once
 * the new connection has claimed the session (announced in every tab), the
 * call's media sessions are opened again there.
 *
 * Mocked: the service and the instance channel, the transport's I/O boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendRequest: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
vi.mock('@/lib/multi-instance', () => ({ instanceManager: { isLeader: false }, instanceChannel: { send: vi.fn() } }));
vi.mock('@/lib/websocket-service', () => ({ websocketService: { sendRequest, getClient: (): null => null } }));

import { eventEmitter } from '@/lib/event-emitter';
import { SESSION_CLAIMED } from '@/lib/multi-instance/claim-relay';
import { WebSocketCallTransport } from '../websocket-call-transport';
import { MediaSessionRebind } from '../media-session-rebind';
import type { MessageSenderConfig } from '@/lib/p2p/message-sender-types';

type Open = { MediaOpen: { request_id: string; cid: bigint; peer_cid: bigint } };

beforeEach(() => {
  sendRequest.mockReset();
  // The service confirms every open, as the agent does for a claimed session.
  sendRequest.mockImplementation(async (request: Open | Record<string, unknown>): Promise<void> => {
    const open: Open['MediaOpen'] | undefined = (request as Open).MediaOpen;
    if (open) queueMicrotask(() => eventEmitter.emit('websocket-message', { MediaSessionOpened: { ...open } }));
  });
});

function opens(): bigint[] {
  return sendRequest.mock.calls.map((c) => (c[0] as Open).MediaOpen?.peer_cid).filter((p): p is bigint => p !== undefined);
}

describe('a call when its session is claimed on a new connection', () => {
  it('opens its media sessions again there', async () => {
    const t: WebSocketCallTransport = new WebSocketCallTransport({ selfCid: 11n, senderConfig: {} as MessageSenderConfig });
    await t.openSession(22n);
    expect(opens()).toEqual([22n]);

    eventEmitter.emit(SESSION_CLAIMED, { cid: 11n, relayed: true });
    await vi.waitFor(() => expect(opens()).toEqual([22n, 22n]));

    // Another session's claim is not this call's socket changing.
    eventEmitter.emit(SESSION_CLAIMED, { cid: 99n, relayed: true });
    // A closed session is not reopened, and a finished call stops listening.
    await t.closeSession(22n);
    eventEmitter.emit(SESSION_CLAIMED, { cid: 11n, relayed: true });
    await Promise.resolve();
    expect(opens()).toEqual([22n, 22n]);
  });
});

describe('MediaSessionRebind', () => {
  it('listens only while a session is open', () => {
    const unsubscribe: ReturnType<typeof vi.fn> = vi.fn();
    const subscribe: ReturnType<typeof vi.fn> = vi.fn(() => unsubscribe);
    const r: MediaSessionRebind = new MediaSessionRebind({
      onSessionClaimed: subscribe, selfCid: 11n, reopen: vi.fn().mockResolvedValue(undefined), reportFailure: vi.fn(),
    });
    r.opened(1n);
    r.opened(2n);
    expect(subscribe).toHaveBeenCalledTimes(1);
    r.closed(1n);
    expect(unsubscribe).not.toHaveBeenCalled();
    r.closed(2n);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reports a re-open that fails rather than dropping it', async () => {
    const claim: { handler: ((cid: bigint) => void) | null } = { handler: null };
    const reportFailure: ReturnType<typeof vi.fn> = vi.fn();
    const r: MediaSessionRebind = new MediaSessionRebind({
      onSessionClaimed: (h) => { claim.handler = h; return (): void => undefined; },
      selfCid: 11n, reopen: vi.fn().mockRejectedValue(new Error('refused')), reportFailure,
    });
    r.opened(7n);
    claim.handler?.(11n);
    await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledWith(7n, expect.any(Error)));
  });
});
