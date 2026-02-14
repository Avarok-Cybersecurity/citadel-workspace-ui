import { websocketService } from '@/lib/websocket-service';
import { eventEmitter } from '@/lib/event-emitter';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage, hasVariant, getVariant } from '@/lib/ws-message-boundary';
import { TIMEOUT } from '@/lib/timeout-constants';
import type { Peer } from './usePeerDiscovery';

interface SessionEntry {
  cid: bigint;
  username?: string;
}

interface PeerEntry {
  cid: bigint;
  username?: string;
  full_name?: string;
  is_online?: boolean;
}

/**
 * Fallback discovery using GetSessions.
 * Queries the internal service's session map directly.
 */
export async function discoverPeersViaGetSessions(currentCid: bigint | null): Promise<Peer[]> {
  const requestId = crypto.randomUUID();
  const request = {
    GetSessions: { request_id: requestId, cid: 0 }
  };

  const responsePromise = new Promise<{ sessions?: SessionEntry[]; request_id?: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('GetSessions timed out'));
    }, TIMEOUT.SERVER_REQUEST_MS);

    const handleMessage = (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      if (hasVariant(message, 'GetSessionsResponse')) {
        const resp = getVariant(message, 'GetSessionsResponse')!;
        if (resp.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve(resp as { sessions?: SessionEntry[]; request_id?: string });
        }
      }
    };

    eventEmitter.on('websocket-message', handleMessage);
  });

  await websocketService.sendMessage(request);
  const response = await responsePromise;
  const sessions: SessionEntry[] = response.sessions || [];
  debugLog('PeerDiscoveryModal', 'GetSessions returned', sessions.length, 'sessions');

  return sessions
    .filter((s) => s.cid.toString() !== currentCid?.toString())
    .map((s) => ({
      cid: s.cid.toString(),
      username: s.username || 'Unknown',
      fullName: undefined,
      is_online: true
    }));
}

/**
 * Load the set of already-registered peer CIDs via ListRegisteredPeers.
 */
export async function fetchRegisteredPeers(currentCid: bigint): Promise<Set<string>> {
  const requestId = crypto.randomUUID();
  broadcastChannelService.registerRequest(requestId, currentCid);

  const request = {
    ListRegisteredPeers: { request_id: requestId, cid: currentCid }
  };

  const responsePromise = new Promise<{ peers?: Record<string, unknown>; request_id?: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      broadcastChannelService.clearRequest(requestId);
      reject(new Error('Request timed out'));
    }, 10000);

    const handleMessage = (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      if (hasVariant(message, 'ListRegisteredPeersResponse')) {
        const resp = getVariant(message, 'ListRegisteredPeersResponse')!;
        if (resp.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve(resp as { peers?: Record<string, unknown>; request_id?: string });
        }
      } else if (hasVariant(message, 'ListRegisteredPeersFailure')) {
        const fail = getVariant(message, 'ListRegisteredPeersFailure')!;
        if (fail.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error((fail.message as string) || 'Failed to list registered peers'));
        }
      }
    };

    eventEmitter.on('websocket-message', handleMessage);
  });

  await websocketService.sendMessage(request);
  const response = await responsePromise;

  const registered = new Set<string>();
  if (response.peers) {
    Object.keys(response.peers).forEach((peerCid: string) => {
      registered.add(peerCid);
    });
  }
  return registered;
}

/**
 * Discover all peers via ListAllPeers request, with GetSessions fallback.
 */
export async function fetchAllPeers(currentCid: bigint): Promise<Peer[]> {
  const requestId = crypto.randomUUID();
  broadcastChannelService.registerRequest(requestId, currentCid);

  const request = {
    ListAllPeers: { request_id: requestId, cid: currentCid }
  };

  const responsePromise = new Promise<{ peer_information?: Record<string, PeerEntry>; request_id?: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      broadcastChannelService.clearRequest(requestId);
      reject(new Error('Request timed out'));
    }, 10000);

    const handleMessage = (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      if (hasVariant(message, 'ListAllPeersResponse')) {
        const resp = getVariant(message, 'ListAllPeersResponse')!;
        if (resp.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve(resp as { peer_information?: Record<string, PeerEntry>; request_id?: string });
        }
      } else if (hasVariant(message, 'ListAllPeersFailure')) {
        const fail = getVariant(message, 'ListAllPeersFailure')!;
        if (fail.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error((fail.message as string) || 'Failed to list peers'));
        }
      }
    };

    eventEmitter.on('websocket-message', handleMessage);
  });

  await websocketService.sendMessage(request);
  const response = await responsePromise;

  const peerInfo: Record<string, PeerEntry> = response.peer_information || {};
  const peerList: PeerEntry[] = Object.values(peerInfo);
  return peerList
    .filter((p) => p.cid !== currentCid)
    .map((p) => ({
      cid: p.cid.toString(),
      username: p.username || 'Unknown',
      fullName: p.full_name,
      is_online: p.is_online || false
    }));
}
