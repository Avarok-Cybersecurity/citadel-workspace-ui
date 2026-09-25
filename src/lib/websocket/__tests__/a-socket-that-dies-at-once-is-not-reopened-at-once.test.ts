/**
 * The reconnect storm: a socket that connects and then dies at once.
 *
 * Seen live after the agent restarted: one tab opened and closed 50-70
 * WebSockets a second, indefinitely. Each connect succeeded, the agent's end
 * went away straight after, and the next request re-opened a socket with no
 * spacing at all.
 *
 * This drives the real `WebSocketInitialization` and the real disconnect
 * teardown. Only the WASM client is faked (vitest cannot run the WASM module):
 * its `init()` "connects" and then reports the connection lost, the way
 * `onWasmWebSocketDisconnected` does. The app side is modelled by re-opening
 * the moment the service resets, which is what a request's `init()` did.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const attempts: { at: number[]; failNext: number } = vi.hoisted(() => ({ at: [], failNext: 0 }));
const constructed: { configs: Array<Record<string, unknown>> } = vi.hoisted(() => ({ configs: [] }));
const liveFor: { ms: number } = vi.hoisted(() => ({ ms: 1 }));

vi.mock('../../multi-instance', () => ({
  instanceManager: { isLeader: true, leaderId: 'leader', instanceId: 'leader' },
  leaderOutboundHandler: { setWebSocketSendFunction: vi.fn() },
}));
vi.mock('../leader-inbound-handler', () => ({
  leaderInboundHandler: (h: unknown): unknown => h,
}));

vi.mock('citadel-workspace-client-ts', async () => {
  const { eventEmitter }: typeof import('../../event-emitter') = await import('../../event-emitter');
  return {
    WorkspaceClient: class {
      constructor(config: Record<string, unknown>) { constructed.configs.push(config); }
      async init(): Promise<void> {
        attempts.at.push(Date.now());
        if (attempts.failNext > 0) {
          attempts.failNext -= 1;
          throw new Error('WebSocket connection failed: ConnectionFailed { code: 1006 }');
        }
        // Connected; the communication task then ends.
        setTimeout(() => {
          eventEmitter.emit('websocket-disconnected', { reason: 'WebSocket communication task ended' });
        }, liveFor.ms);
      }
      stopMessageProcessing(): void {}
      async close(): Promise<void> {}
      async sendDirectToInternalService(): Promise<void> {}
    },
  };
});

import { WebSocketInitialization } from '../initialization';
import { ReconnectBackoff, systemClock, AGENT_RECONNECT_BACKOFF, type ReconnectBackoffPolicy } from '../reconnect-backoff';

/** No spacing at all: the behaviour before the gate, used as the control. */
const NO_BACKOFF: ReconnectBackoffPolicy = { baseDelayMs: 0, maxDelayMs: 0, stableAfterMs: 0 };

function startTab(policy: ReconnectBackoffPolicy): void {
  const init: WebSocketInitialization = new WebSocketInitialization({
    websocketUrl: 'ws://agent.test/ws',
    onClientCreated: (): void => {},
    // What a request's `init()` does after the service has been reset.
    onClientReset: () => open(),
    releaseSession: (): void => {},
    reconnectBackoff: new ReconnectBackoff(policy, systemClock),
  });
  // A failed or refused open is retried by its caller (start-up retry, the
  // retry dialog, the next request) -- here every 100ms, as often as the retry
  // dialog's countdown polls.
  const open: () => void = (): void => {
    void init.createWebSocketAsLeader().catch(() => { setTimeout(open, 100); });
  };
  open();
}

describe('a socket that dies as soon as it connects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    attempts.at = [];
    attempts.failNext = 0;
    constructed.configs = [];
    liveFor.ms = 1;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is re-opened a bounded number of times, with exponential spacing capped at the maximum', async () => {
    startTab(AGENT_RECONNECT_BACKOFF);
    await vi.advanceTimersByTimeAsync(60_000);

    // 0, 1, 3, 7, 15, 31s -- the next is due at 61s.
    expect(attempts.at.length).toBeGreaterThanOrEqual(5);
    expect(attempts.at.length).toBeLessThanOrEqual(7);

    const gaps: number[] = attempts.at.slice(1).map((t, i) => t - attempts.at[i]);
    for (let i: number = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] * 1.9);
    }

    // The cap: keep it dying for ten more minutes and the spacing stops growing.
    await vi.advanceTimersByTimeAsync(600_000);
    const late: number[] = attempts.at.slice(-4);
    const lateGaps: number[] = late.slice(1).map((t, i) => t - late[i]);
    for (const gap of lateGaps as number[]) {
      expect(gap).toBeGreaterThanOrEqual(AGENT_RECONNECT_BACKOFF.maxDelayMs);
      expect(gap).toBeLessThan(AGENT_RECONNECT_BACKOFF.maxDelayMs + 1000);
    }
  });

  it('spaces failed attempts the same way', async () => {
    attempts.failNext = 1_000_000;
    startTab(AGENT_RECONNECT_BACKOFF);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts.at.length).toBeLessThanOrEqual(7);
  });

  it('resets after a connection that stayed up, so the next outage is retried at once', async () => {
    startTab(AGENT_RECONNECT_BACKOFF);
    await vi.advanceTimersByTimeAsync(20_000); // several short-lived connections: backoff is at 16s
    const before: number = attempts.at.length;

    // The next connection stays up past the stable window, then drops.
    liveFor.ms = AGENT_RECONNECT_BACKOFF.stableAfterMs + 5_000;
    await vi.advanceTimersByTimeAsync(20_000);
    liveFor.ms = 1;
    const healthyEndedAt: number = attempts.at[attempts.at.length - 1] + AGENT_RECONNECT_BACKOFF.stableAfterMs + 5_000;
    await vi.advanceTimersByTimeAsync(40_000);

    const after: number[] = attempts.at.filter((t) => t >= healthyEndedAt);
    expect(attempts.at.length).toBeGreaterThan(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0] - healthyEndedAt).toBeLessThan(AGENT_RECONNECT_BACKOFF.baseDelayMs);
  });

  it('turns the client library\'s own reconnect off, so this is the only reconnect policy', async () => {
    startTab(AGENT_RECONNECT_BACKOFF);
    await vi.advanceTimersByTimeAsync(0);
    expect(constructed.configs[0]?.sessionConfig).toEqual({ autoReconnect: false });
  });

  it('control: without spacing the same harness reproduces the storm', async () => {
    startTab(NO_BACKOFF);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempts.at.length).toBeGreaterThan(100);
  });
});
