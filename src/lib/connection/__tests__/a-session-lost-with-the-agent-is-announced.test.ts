/**
 * The agent keeps sessions in memory, so when it restarts they are gone. The
 * tab reconnected its socket and went on showing the workspace as if nothing
 * had happened, while every request for the session was refused.
 *
 * After a reconnect that follows a lost socket, the tab now asks the agent for
 * its sessions and, if its own is not among them, says so.
 */
import { describe, it, expect, vi } from 'vitest';
import { watchForSessionLostWithAgent, type SessionLostDeps } from '../sessions-lost-with-agent';
import type { ActiveSessionsResult } from '../queries';
import type { ActiveSession } from '@/types/session-types';

type Handler = () => void;

interface Harness { deps: SessionLostDeps; fire: (event: string) => Promise<void>; notify: ReturnType<typeof vi.fn> }

function harness(opts: { currentCid: bigint | null; sessions: ActiveSessionsResult }): Harness {
  const handlers: Map<string, Handler[]> = new Map();
  const notify: ReturnType<typeof vi.fn> = vi.fn();
  const deps: SessionLostDeps = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => undefined;
    },
    currentCid: async () => opts.currentCid,
    activeSessions: async () => opts.sessions,
    wait: async () => undefined,
    notifySessionLost: notify,
  };
  const fire = async (event: string): Promise<void> => {
    for (const h of handlers.get(event) ?? []) h();
    // The check runs detached from the emit, as it does under the real emitter.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  };
  return { deps, fire, notify };
}

const session: (cid: bigint) => ActiveSession = (cid: bigint): ActiveSession => ({ cid } as unknown as ActiveSession);

describe('a session lost with the agent', () => {
  it('is announced after the socket comes back without it', async () => {
    const h: Harness = harness({ currentCid: 7n, sessions: { ok: true, sessions: [session(9n)] } });
    watchForSessionLostWithAgent(h.deps, 0);
    await h.fire('websocket-disconnected');
    await h.fire('on-ws-connection-success');
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('is not announced when the session survived', async () => {
    const h: Harness = harness({ currentCid: 7n, sessions: { ok: true, sessions: [session(7n)] } });
    watchForSessionLostWithAgent(h.deps, 0);
    await h.fire('websocket-disconnected');
    await h.fire('on-ws-connection-success');
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('is not announced on the first connection, or when the answer was a failure', async () => {
    const first: Harness = harness({ currentCid: 7n, sessions: { ok: true, sessions: [] } });
    watchForSessionLostWithAgent(first.deps, 0);
    await first.fire('on-ws-connection-success');
    expect(first.notify).not.toHaveBeenCalled();

    // A failed query is not "you have no sessions" (queries.ts).
    const failed: Harness = harness({ currentCid: 7n, sessions: { ok: false, sessions: [] } });
    watchForSessionLostWithAgent(failed.deps, 0);
    await failed.fire('websocket-disconnected');
    await failed.fire('on-ws-connection-success');
    expect(failed.notify).not.toHaveBeenCalled();
  });

  it('is not announced for a tab that was not signed in', async () => {
    const h: Harness = harness({ currentCid: null, sessions: { ok: true, sessions: [] } });
    watchForSessionLostWithAgent(h.deps, 0);
    await h.fire('websocket-disconnected');
    await h.fire('on-ws-connection-success');
    expect(h.notify).not.toHaveBeenCalled();
  });
});
