/**
 * What the collaborative editor needs from whatever keeps its document in sync.
 *
 * Two keep it: the P2P provider (yjs-p2p-provider) between two people, and the relay provider
 * (yjs-relay-provider) through the server for an office or room chat. The editor takes a
 * `ConnectCollab` and does not know which; it is handed one by the view that opened it.
 */
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

export interface CollabProvider {
  readonly awareness: Awareness;
  setLocalState(state: Record<string, unknown>): void;
  setLocalStateField(field: string, value: unknown): void;
  getStates(): ReturnType<Awareness['getStates']>;
  destroy(): void;
}

/** Connects `doc` to its collaborators. The provider announces `yjs:sync-complete` once synced. */
export type ConnectCollab = (doc: Y.Doc) => CollabProvider;
