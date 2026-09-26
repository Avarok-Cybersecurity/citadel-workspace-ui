/**
 * The paused-contact outbox over this service's own LocalDB operations.
 *
 * Built here, from the service's methods, rather than imported from the pause
 * module's agent wiring: that wiring imports this service, and the outbox sits
 * inside this service's send path.
 */
import { PausedOutbox } from '@/lib/p2p-pause/outbox';

interface LocalDBSurface {
  sendLocalDBGet(cid: bigint, key: string): Promise<{ value: number[] } | null>;
  sendLocalDBSet(cid: bigint, key: string, value: number[]): Promise<void>;
  sendLocalDBDelete(cid: bigint, key: string): Promise<void>;
  sendLocalDBListKeys(cid: bigint, prefix?: string): Promise<string[]>;
}

export function pausedOutboxOver(db: LocalDBSurface): PausedOutbox {
  return new PausedOutbox({
    storage: {
      get: (cid: bigint, key: string): Promise<{ value: number[] } | null> => db.sendLocalDBGet(cid, key),
      set: (cid: bigint, key: string, value: number[]): Promise<void> => db.sendLocalDBSet(cid, key, value),
      remove: (cid: bigint, key: string): Promise<void> => db.sendLocalDBDelete(cid, key),
      listKeys: (cid: bigint, prefix: string): Promise<string[]> => db.sendLocalDBListKeys(cid, prefix),
    },
    now: (): number => Date.now(),
  });
}
