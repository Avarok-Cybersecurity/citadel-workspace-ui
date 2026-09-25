/**
 * Noticing that the agent came back without this tab's session.
 *
 * The agent holds sessions in memory. When it restarts, the socket reconnects
 * and the retry dialog closes, but the session the tab is showing no longer
 * exists: every request for it is refused, and nothing on screen says why.
 *
 * After a reconnect that follows a lost socket, wait `graceMs` (so an automatic
 * sign-in with saved credentials can land first), ask the agent which sessions
 * it holds, and report when this tab's is not among them. A failed query is
 * not an answer and reports nothing.
 */
import type { ActiveSessionsResult } from './queries';

export interface SessionLostDeps {
  on(event: 'websocket-disconnected' | 'on-ws-connection-success', handler: () => void): () => void;
  currentCid(): Promise<bigint | null>;
  activeSessions(): Promise<ActiveSessionsResult>;
  wait(ms: number): Promise<void>;
  notifySessionLost(): void;
}

export function watchForSessionLostWithAgent(deps: SessionLostDeps, graceMs: number): () => void {
  let cidAtLoss: Promise<bigint | null> | null = null;

  const offLost: () => void = deps.on('websocket-disconnected', (): void => {
    cidAtLoss ??= deps.currentCid();
  });

  const offBack: () => void = deps.on('on-ws-connection-success', (): void => {
    const lost: Promise<bigint | null> | null = cidAtLoss;
    cidAtLoss = null;
    if (!lost) return;
    void (async (): Promise<void> => {
      const cid: bigint | null = await lost;
      if (cid === null) return;
      await deps.wait(graceMs);
      const result: ActiveSessionsResult = await deps.activeSessions();
      if (result.ok && !result.sessions.some((s) => s.cid === cid)) deps.notifySessionLost();
    })();
  });

  return (): void => { offLost(); offBack(); };
}
