/**
 * P2P Auto-Connect Event Handlers
 *
 * Sets up all event listeners for the auto-connect service.
 * Events drive the single source of truth for peer connections.
 */

import { eventEmitter } from '../event-emitter';
import { p2pRegistrationService } from '../p2p-registration-service';
import { instanceManager } from '../multi-instance';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage, hasVariant, getVariant } from '@/lib/ws-message-boundary';
import type { BroadcastStateSyncData, WebSocketMessage } from '@/types/ws-message-types';
import type { AutoConnectState } from './state';
import { getCurrentCid } from './cid-resolver';
import { connectToPeer, handleConnectionSuccess, handlePeerDisconnect } from './connection-logic';
import { handleIncomingPeerConnect } from './incoming-connect';
import { startPolling, stopPolling, startBackendPolling, stopBackendPolling } from './polling';

/** Callback type for setPeerConnected (broadcasts to followers) */
type BroadcastPeerConnected = (localCid: bigint, peerCid: bigint, peerUsername: string, localUsername?: string) => void;

/**
 * Set up all event listeners for the P2P auto-connect service.
 * @param state - The shared AutoConnectState
 * @param broadcastPeerConnected - Callback to set peer connected with broadcast
 * @param connectAll - Callback to connect to all registered peers
 */
export function setupEventListeners(
  state: AutoConnectState,
  broadcastPeerConnected: BroadcastPeerConnected,
  connectAll: () => Promise<void>
): void {
  eventEmitter.on('p2p:registration-service-started', () => {
    startPolling(state, connectAll);
    startBackendPolling(state);
  });

  eventEmitter.on('p2p:registration-service-stopped', () => {
    stopPolling(state);
    stopBackendPolling(state);
    state.cancelAllRetries();
  });

  eventEmitter.on('websocket-disconnected', ({ reason }: { reason: string }) => {
    debugLog('P2PAutoConnectService', `[P2PAutoConnect] WebSocket disconnected: ${reason}, stopping all polling`);
    stopPolling(state);
    stopBackendPolling(state);
    state.cancelAllRetries();
  });

  eventEmitter.on('connection-failure', ({ error }: { error: string }) => {
    debugLog('P2PAutoConnectService', `[P2PAutoConnect] Connection failure: ${error}, stopping all polling`);
    stopPolling(state);
    stopBackendPolling(state);
    state.cancelAllRetries();
  });

  eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
    debugLog('P2PAutoConnectService', `[P2PAutoConnect] Leader changed - isLeader: ${data.isLeader}`);
    if (data.isLeader) {
      startPolling(state, connectAll);
      startBackendPolling(state);
    } else {
      stopPolling(state);
      stopBackendPolling(state);
      state.cancelAllRetries();
    }
  });

  // Follower tab connectedPeers sync
  eventEmitter.on('broadcast-state-sync', (raw: unknown) => {
    const data: BroadcastStateSyncData = raw as BroadcastStateSyncData;
    if (data?.type === 'connected-peers-update' && !instanceManager.isLeader) {
      const localCid: string | undefined = data.localCid as string | undefined;
      const peerCid: string | undefined = data.peerCid as string | undefined;
      const peerUsername: string | undefined = data.peerUsername as string | undefined;
      const localUsername: string | undefined = data.localUsername as string | undefined;
      if (localCid !== undefined && peerCid !== undefined) {
        const localCidBigInt: bigint = BigInt(localCid);
        const peerCidBigInt: bigint = BigInt(peerCid);
        debugLog('P2PAutoConnectService', `Follower received connectedPeers update: ${localCidBigInt.toString().slice(0, 8)}... <-> ${peerCidBigInt.toString().slice(0, 8)}...`);
        state.setPeerConnectedLocal(localCidBigInt, peerCidBigInt, peerUsername || '', localUsername || '');
        eventEmitter.emit('p2p-connection-established', {
          peerCid: peerCidBigInt,
          peerUsername: peerUsername || ''
        });
      }
    }
  });

  // Immediate connect on peer registration
  eventEmitter.on('p2p:peer-registered', ({ peer, isIncoming }: { peer: { cid?: bigint }; isIncoming?: boolean; isOutgoing?: boolean }) => {
    const peerCid: bigint | undefined = peer?.cid;
    if (peerCid === undefined) return;

    if (isIncoming) {
      const weRegisteredFirst: boolean = p2pRegistrationService.hasOutgoingRegistration(peerCid);
      if (weRegisteredFirst) {
        state.addOnlinePeer(peerCid);
        debugLog('P2PAutoConnectService', `P2PAutoConnect: Mutual registration complete with ${peerCid.toString().slice(0, 8)}..., initiating immediate connection`);
        connectToPeer(state, peerCid).catch((err) => {
          debugLog('P2PAutoConnectService', `Failed to connect after mutual registration ${peerCid.toString().slice(0, 8)}...:`, err);
        });
      } else {
        debugLog('P2PAutoConnectService', `P2PAutoConnect: Incoming registration from ${peerCid.toString().slice(0, 8)}..., waiting for user to accept`);
      }
      return;
    }

    state.addOnlinePeer(peerCid);
    debugLog('P2PAutoConnectService', `P2PAutoConnect: Outgoing registration to ${peerCid.toString().slice(0, 8)}... confirmed, initiating immediate connection`);
    connectToPeer(state, peerCid).catch((err) => {
      debugLog('P2PAutoConnectService', `Failed to connect to newly registered peer ${peerCid.toString().slice(0, 8)}...:`, err);
    });
  });

  // When WE accept a peer registration, do NOT call PeerConnect.
  eventEmitter.on('p2p:registration-accepted', ({ peerCid }: { peerCid: bigint }) => {
    if (peerCid !== undefined) {
      debugLog('P2PAutoConnectService', `P2PAutoConnect: Registration accepted for ${peerCid.toString().slice(0, 8)}... - waiting for initiator to connect`);
    }
  });

  // WebSocket message handler for P2P connect/disconnect events
  setupWebSocketMessageHandler(state, broadcastPeerConnected);
}

/**
 * Handle WebSocket messages for P2P connect/disconnect events.
 * Separated for readability.
 */
function setupWebSocketMessageHandler(
  state: AutoConnectState,
  broadcastPeerConnected: BroadcastPeerConnected
): void {
  eventEmitter.on('websocket-message', async (raw: unknown) => {
    const message: WebSocketMessage | null = narrowWebSocketMessage(raw);
    if (!message) return;

    if (hasVariant(message, 'PeerConnectSuccess')) {
      await handlePeerConnectSuccess(state, message, broadcastPeerConnected);
    }

    if (hasVariant(message, 'PeerConnectNotification')) {
      const notification: Record<string, unknown> = getVariant(message, 'PeerConnectNotification')!;
      if (instanceManager.isLeader) {
        const targetCid: bigint | undefined = notification.cid as bigint | undefined;
        const initiatorCid: bigint | undefined = notification.peer_cid as bigint | undefined;
        const peerUsername: string = (notification.peer_username as string) || '';
        if (targetCid !== undefined && initiatorCid !== undefined) {
          debugLog('P2PAutoConnectService', `Leader updating connectedPeers for target CID ${targetCid.toString().slice(0, 8)}... -> peer ${initiatorCid.toString().slice(0, 8)}...`);
          broadcastPeerConnected(targetCid, initiatorCid, peerUsername);
        }
      }
      handleIncomingPeerConnect(
        state,
        notification as { cid?: bigint; peer_cid?: bigint; peer_username?: string },
        broadcastPeerConnected
      ).catch((err) => {
        debugLog('P2PAutoConnectService', 'handleIncomingPeerConnect failed:', err);
      });
    }

    if (hasVariant(message, 'PeerDisconnect')) {
      await handleDisconnectVariant(state, message, 'PeerDisconnect');
    }

    if (hasVariant(message, 'DisconnectNotification')) {
      const v: Record<string, unknown> = getVariant(message, 'DisconnectNotification')!;
      if (v.peer_cid) {
        await handleDisconnectVariant(state, message, 'DisconnectNotification');
      }
    }
  });
}

async function handlePeerConnectSuccess(
  state: AutoConnectState,
  message: WebSocketMessage,
  broadcastPeerConnected: BroadcastPeerConnected
): Promise<void> {
  const v: Record<string, unknown> = getVariant(message, 'PeerConnectSuccess')!;
  const messageCid: bigint | undefined = v.cid as bigint | undefined;
  const peerCid: bigint | undefined = v.peer_cid as bigint | undefined;
  const peerUsername: string = (v.peer_username as string) || '';

  if (instanceManager.isLeader && messageCid !== undefined && peerCid !== undefined) {
    debugLog('P2PAutoConnectService', `Leader updating connectedPeers for initiator CID ${messageCid.toString().slice(0, 8)}... -> peer ${peerCid.toString().slice(0, 8)}...`);
    broadcastPeerConnected(messageCid, peerCid, peerUsername);
  }

  const currentCid: bigint | null = await getCurrentCid();
  if (messageCid !== undefined && currentCid && messageCid !== currentCid) return;

  if (peerCid !== undefined && peerCid !== currentCid && currentCid) {
    handleConnectionSuccess(state, currentCid, peerCid, peerUsername, broadcastPeerConnected);
  }
}

async function handleDisconnectVariant(
  state: AutoConnectState,
  message: WebSocketMessage,
  variant: 'PeerDisconnect' | 'DisconnectNotification'
): Promise<void> {
  const v: Record<string, unknown> = getVariant(message, variant)!;
  const messageCid: bigint | undefined = v.cid as bigint | undefined;
  const peerCid: bigint | undefined = v.peer_cid as bigint | undefined;

  if (instanceManager.isLeader && messageCid !== undefined && peerCid !== undefined) {
    debugLog('P2PAutoConnectService', `Leader ${variant}: removing peer ${peerCid.toString().slice(0, 8)}... from CID ${messageCid.toString().slice(0, 8)}...`);
    state.setPeerDisconnected(messageCid, peerCid);
  }

  const currentCid: bigint | null = await getCurrentCid();
  if (messageCid !== undefined && currentCid && messageCid !== currentCid) return;

  if (peerCid !== undefined && currentCid) {
    if (variant === 'DisconnectNotification') {
      debugLog('P2PAutoConnectService', `[P2PAutoConnect] DisconnectNotification: Peer ${peerCid.toString().slice(0, 8)}... session disconnected`);
    }
    handlePeerDisconnect(state, currentCid, peerCid);
  }
}
