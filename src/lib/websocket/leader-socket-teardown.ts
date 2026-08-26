/**
 * Tearing down the socket this tab owned while it was leader.
 *
 * Split out of `initialization.ts` so socket creation and socket teardown are
 * not in one file at the 250-line ceiling — they are separately non-obvious.
 */

import type { WorkspaceClient } from 'citadel-workspace-client-ts';
import { eventEmitter } from '../event-emitter';
import { debugLog } from '../debug-config';

export interface TeardownHooks {
  /** Drop the cached client handle. */
  clearClient: () => void;
  onClientReset: () => void;
  releaseSession: (cid: bigint) => void;
}

/**
 * Reset this tab's socket state when the connection drops.
 *
 * Clearing the handle is load-bearing: `createWebSocketAsLeader` returns
 * `leaderClient` when set, so a CLOSED client left there makes every subsequent
 * reconnect hand back the dead client and report success over a socket that is
 * gone — the user sees a green "connection restored" over nothing.
 */
export function setupDisconnectionHandler(client: WorkspaceClient, hooks: TeardownHooks): void {
  eventEmitter.on('websocket-disconnected', async () => {
    debugLog('WebSocketInit', 'WebSocket disconnected event received, stopping message processing and resetting state');
    client.stopMessageProcessing();
    try {
      await client.close();
      debugLog('WebSocketInit', 'WASM client closed successfully');
    } catch (closeError) {
      debugLog('WebSocketInit', 'WASM client close error (ignored):', closeError);
    }

    hooks.clearClient();
    hooks.onClientReset();
    debugLog('WebSocketInit', 'WebSocket service state reset after disconnection');
  });
}

export function setupSessionReleaseHandler(hooks: Pick<TeardownHooks, 'releaseSession'>): void {
  eventEmitter.on('session:release-request', ({ cid }: { cid: bigint }) => {
    debugLog('WebSocketInit', `Session release requested for CID ${cid.toString()}`);
    hooks.releaseSession(cid);
  });
}

/** Stop and close a client this tab is no longer leader for. */
export async function closeLeaderSocket(client: WorkspaceClient): Promise<void> {
  debugLog('WebSocketInit', "Demoted from leader: closing this tab's WebSocket");
  client.stopMessageProcessing();
  try {
    await client.close();
  } catch (closeError) {
    debugLog('WebSocketInit', 'WASM client close error on demotion (ignored):', closeError);
  }
}
