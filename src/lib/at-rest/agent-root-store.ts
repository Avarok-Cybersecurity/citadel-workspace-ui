/**
 * Where an account's encryption root is kept: the Citadel agent's own store for that account
 * (LocalDB), reached over this tab's signed-in session, never beside the records it protects.
 * The I/O edge of encryption at rest; loaded with it.
 */
import { isGenuinelyAbsent } from '@/lib/storage/absence';

const ROOT_KEY: string = 'cdoc-collab/at-rest-root/v1';

export interface AtRestRootStore {
  /** The account's root; null when none was ever made. Rejects when the agent did not answer. */
  read(account: bigint): Promise<Uint8Array | null>;
  write(account: bigint, root: Uint8Array): Promise<void>;
  remove(account: bigint): Promise<void>;
}

const agent = async (): Promise<typeof import('@/lib/websocket-service').websocketService> => (await import('@/lib/websocket-service')).websocketService;

export const agentRootStore: AtRestRootStore = {
  read: async (account: bigint): Promise<Uint8Array | null> => {
    try {
      const stored: { value: number[] } | null = await (await agent()).sendLocalDBGet(account, ROOT_KEY);
      return stored === null ? null : Uint8Array.from(stored.value);
    } catch (error: unknown) {
      if (isGenuinelyAbsent(error)) return null;
      throw error;
    }
  },
  write: async (account: bigint, root: Uint8Array): Promise<void> => (await agent()).sendLocalDBSet(account, ROOT_KEY, Array.from(root)),
  remove: async (account: bigint): Promise<void> => {
    try {
      await (await agent()).sendLocalDBDelete(account, ROOT_KEY);
    } catch (error: unknown) {
      if (!isGenuinelyAbsent(error)) throw error;
    }
  },
};
