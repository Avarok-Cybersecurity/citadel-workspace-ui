/**
 * Where a paused contact's outbound waits: here, not in the ILM.
 *
 * The ILM holds messages for a peer only while this app says the peer is not
 * connected -- its `connected_peers` is this app's connection state. Live, a
 * paused contact's link came back without anyone accepting it (an SDK
 * simultaneous-connect shortcut), the state said "connected", and the ILM
 * drained everything the user had been told would wait. So a send to a paused
 * contact never reaches the ILM at all. It is written to the agent's LocalDB,
 * under the local session, one key per message, and leaves on Resume.
 *
 * One key per message, ordered by time then a random tiebreak, so two tabs
 * writing at once cannot overwrite each other. Durable, because the banner
 * promises delivery after Resume and a reload in between must not break that.
 */
import { readPauseStatus, type PauseStorage } from './pause-store';
import type { PauseStatus } from './pause-rules';
import { isGenuinelyAbsent } from '@/lib/storage/absence';

export interface OutboxStorage extends PauseStorage {
  listKeys(localCid: bigint, prefix: string): Promise<string[]>;
}

export type SendOutcome = 'sent' | 'held';

/** A send the pause forbids and nothing can hold: the caller must not retry around it. */
export class PausedPeerError extends Error {
  constructor(peerCid: bigint) {
    super(`The connection to ${peerCid.toString()} is paused`);
    this.name = 'PausedPeerError';
  }
}

const OUTBOX_PREFIX: 'p2p_paused_outbox_' = 'p2p_paused_outbox_';
const TIME_WIDTH: number = 16;

function outboxPrefix(peerCid: bigint): string {
  return `${OUTBOX_PREFIX}${peerCid.toString()}_`;
}

export class PausedOutbox {
  private readonly storage: OutboxStorage;
  private readonly now: () => number;

  constructor(deps: { storage: OutboxStorage; now: () => number }) {
    this.storage = deps.storage;
    this.now = deps.now;
  }

  /**
   * An unreadable pause record is refused rather than guessed: sending could
   * break a pause, and holding would park a message for a contact who may not
   * be paused at all, with no Resume ever coming to release it.
   */
  async sendOrHold(localCid: bigint, peerCid: bigint, bytes: Uint8Array, send: () => Promise<void>): Promise<SendOutcome> {
    const status: PauseStatus = await readPauseStatus(this.storage, localCid, peerCid);
    if (status === 'unknown') {
      throw new Error(`Could not check whether the connection to ${peerCid.toString()} is paused; nothing was sent`);
    }
    if (status === 'active') {
      await send();
      return 'sent';
    }
    const key: string = `${outboxPrefix(peerCid)}${this.now().toString().padStart(TIME_WIDTH, '0')}_${crypto.randomUUID()}`;
    await this.storage.set(localCid, key, Array.from(bytes));
    return 'held';
  }

  /** For sends with no queue behind them: refuse unless known not to be paused. */
  async refuseIfPaused(localCid: bigint, peerCid: bigint): Promise<void> {
    const status: PauseStatus = await readPauseStatus(this.storage, localCid, peerCid);
    if (status !== 'active') throw new PausedPeerError(peerCid);
  }

  async heldCount(localCid: bigint, peerCid: bigint): Promise<number> {
    return (await this.heldKeys(localCid, peerCid)).length;
  }

  /**
   * In write order; each one removed only after it was handed on, and the first
   * failure stops the flush, so what is left is exactly what did not go.
   */
  async flush(localCid: bigint, peerCid: bigint, send: (bytes: Uint8Array) => Promise<void>): Promise<number> {
    const keys: string[] = await this.heldKeys(localCid, peerCid);
    let flushed: number = 0;
    for (const key of keys) {
      const stored: { value: number[] } | null = await this.storage.get(localCid, key);
      if (stored !== null) await send(Uint8Array.from(stored.value));
      await this.storage.remove(localCid, key);
      flushed += 1;
    }
    return flushed;
  }

  private async heldKeys(localCid: bigint, peerCid: bigint): Promise<string[]> {
    try {
      return [...await this.storage.listKeys(localCid, outboxPrefix(peerCid))].sort();
    } catch (error: unknown) {
      if (isGenuinelyAbsent(error)) return [];
      throw error;
    }
  }
}
