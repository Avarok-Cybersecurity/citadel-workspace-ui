/**
 * When retention runs: on opening a chat (`applyRetention`) and for every chat
 * of this account on a timer (`start`). Each chat uses its own period; a chat
 * that keeps everything is never read.
 *
 * Everything that touches the outside world is a dependency, so the decisions
 * here are tested without the agent; retention-sweep binds the real ones.
 */
import type { ChatAdvancedSettings, ChatAdvancedSettingsStore } from './chat-advanced-settings';
import { pruneOlderThan, retentionCutoff, type RetentionPageIO } from './retention';
import { errorLog } from '@/lib/debug-config';

export interface RetentionDeps {
  now: () => number;
  currentCid: () => Promise<bigint | null>;
  settings: Pick<ChatAdvancedSettingsStore, 'get'>;
  /** The peers this account has conversations with. */
  peers: () => bigint[];
  /** Serialises with every other write to the same peer's stored records. */
  lock: <T>(peerCid: bigint, operation: () => Promise<T>) => Promise<T>;
  /** Drop what was pruned from memory and from any open view. */
  onExpired: (peerCid: bigint, cutoff: number) => void;
  /** Run `tick` every `ms`; answers a stop function. */
  every: (ms: number, tick: () => void) => () => void;
  io: RetentionPageIO;
}

export interface RetentionRunner {
  applyRetention(peerCid: bigint): Promise<number>;
  sweepNow(): Promise<void>;
  tick(): Promise<void>;
  start(intervalMs: number): void;
}

export function createRetention(deps: RetentionDeps): RetentionRunner {
  let started: boolean = false;

  async function applyRetention(peerCid: bigint): Promise<number> {
    const own: bigint | null = await deps.currentCid();
    if (own === null) return 0;
    const settings: ChatAdvancedSettings = await deps.settings.get(own, peerCid);
    const cutoff: number | null = retentionCutoff(deps.now(), settings.retention);
    if (cutoff === null) return 0;
    const removed: number = await deps.lock(peerCid, () => pruneOlderThan(deps.io, peerCid, cutoff));
    // Told even when the store held nothing old: the open view can hold
    // messages the store never did (still sending), and they are older too.
    deps.onExpired(peerCid, cutoff);
    return removed;
  }

  async function sweepNow(): Promise<void> {
    // One chat's failure must not keep the others' old messages around.
    const outcomes: PromiseSettledResult<number>[] = await Promise.allSettled(deps.peers().map(applyRetention));
    const failed: PromiseRejectedResult | undefined = outcomes.find(
      (o: PromiseSettledResult<number>): o is PromiseRejectedResult => o.status === 'rejected',
    );
    if (failed) throw failed.reason;
  }

  return {
    applyRetention,
    sweepNow,
    tick: sweepNow,
    start(intervalMs: number): void {
      if (started) return;
      started = true;
      deps.every(intervalMs, (): void => {
        sweepNow().catch((error: unknown): void => errorLog('Retention', 'sweep failed; old messages were not all removed', error));
      });
    },
  };
}
