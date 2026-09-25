/**
 * The pause store, wired to the real agent and the real P2P link.
 *
 * Dropping reuses the existing PeerDisconnect request (`disconnectP2P`); the
 * retry timer is cancelled first so a scheduled redial cannot race the drop.
 * Reconnecting is auto-connect's own `connectToPeer`, which only the leader
 * tab performs -- from a follower, the contact's own auto-connect dials back
 * within its poll interval and is now accepted.
 */
import { websocketService } from '@/lib/websocket-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { agentPauseStorage } from './agent-storage';
import { PeerPauseStore } from './pause-store';

export const peerPauseStore: PeerPauseStore = new PeerPauseStore({
  storage: agentPauseStorage,
  link: {
    isConnected: (localCid: bigint, peerCid: bigint): boolean =>
      p2pAutoConnectService.isPeerConnectedForSession(localCid, peerCid),
    drop: async (localCid: bigint, peerCid: bigint): Promise<void> => {
      p2pAutoConnectService.cancelRetry(peerCid);
      await websocketService.disconnectP2P(localCid, peerCid);
      p2pAutoConnectService.handlePeerDisconnect(localCid, peerCid);
    },
    reconnect: (peerCid: bigint): Promise<void> => p2pAutoConnectService.connectToPeer(peerCid),
  },
});

export type { PauseStatus } from './pause-rules';
export type { PauseChange } from './pause-store';
