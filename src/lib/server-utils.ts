import { websocketService } from './websocket-service';
import { failOnSocketLoss } from './websocket/request-response';
import { eventEmitter } from './event-emitter';
import { getRecentServers } from './recent-servers';
import { stringToBytes, bytesToString } from './utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage, getVariant } from '@/lib/ws-message-boundary';
import { TIMEOUT } from './timeout-constants';

/**
 * Server info stored in LocalDB
 */
export interface StoredServer {
  serverAddress: string;
  serverName?: string;
  lastConnected?: number;
}

/**
 * List known servers from LocalDB
 * @param options Options including cid (use "0" for global storage)
 * @returns Promise with servers array
 */
export async function listKnownServers(options: { cid: string }): Promise<{ servers: StoredServer[] }> {
  try {
    // `canSendRequests`, not `getClient()`. A follower tab owns no client by
    // design and would always have taken the localStorage fallback -- serving a
    // possibly stale saved-workspace list with no indication, even though the
    // LocalDB copy was perfectly reachable by proxy through the leader.
    if (!websocketService.canSendRequests()) {
      // Don't try to initialize here - let ConnectionManager handle it
      debugLog('ServerUtils', 'Cannot reach the internal service yet, falling back to localStorage');
      return { servers: getRecentServers() };
    }
    
    const requestId = crypto.randomUUID();

    // Create a promise to wait for the response
    return failOnSocketLoss('ListKnownServers', new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('List known servers request timed out'));
      }, TIMEOUT.LOCALDB_REQUEST_MS);

      // Set up event listener

      const handler = (raw: unknown) => {
        const message = narrowWebSocketMessage(raw);
        if (!message) return;

        const getAllKVSuccess = getVariant(message, 'LocalDBGetAllKVSuccess');
        if (getAllKVSuccess && getAllKVSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);

          // Extract servers from the response
          const servers: StoredServer[] = [];
          const kvMap = getAllKVSuccess.map as Record<string, unknown> | undefined;

          if (kvMap) {
            // Look for server-related keys
            Object.keys(kvMap).forEach(key => {
              if (key.startsWith('server_') || key === 'known_servers') {
                try {
                  const value = kvMap[key];
                  if (Array.isArray(value)) {
                    // If it's a byte array, convert to string
                    const jsonStr = bytesToString(value);
                    const parsed = JSON.parse(jsonStr);
                    if (Array.isArray(parsed)) {
                      servers.push(...parsed);
                    } else if (parsed.servers) {
                      servers.push(...parsed.servers);
                    }
                  } else if (typeof value === 'object' && value !== null && (value as Record<string, unknown>).servers) {
                    servers.push(...(value as Record<string, unknown>).servers as StoredServer[]);
                  }
                } catch (e) {
                  debugLog('ServerUtils', 'Error parsing server data:', e);
                }
              }
            });
          }

          resolve({ servers });
        } else {
          const getAllKVFailure = getVariant(message, 'LocalDBGetAllKVFailure');
          if (getAllKVFailure && getAllKVFailure.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            reject(new Error((getAllKVFailure.message as string) || 'Failed to get known servers'));
          }
        }
      };

      // Listen for WebSocket messages
      eventEmitter.on('websocket-message', handler);

      // Send the request
      const request = {
        LocalDBGetAllKV: {
          request_id: requestId,
          cid: BigInt(options.cid || '0'),
          peer_cid: null
        }
      };

      websocketService.sendMessage(request as unknown as Record<string, unknown>)
        .catch(error => {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(error);
        });
    }));
  } catch (error) {
    debugLog('ServerUtils', 'Error in listKnownServers:', error);
    // Return empty array on error to prevent UI crashes
    return { servers: [] };
  }
}

/**
 * Store a known server in LocalDB
 * @param server Server info to store
 * @param cid Connection ID (use "0" for global storage)
 */
export async function storeKnownServer(server: StoredServer, cid: string = "0"): Promise<void> {
  try {
    if (!websocketService.canSendRequests()) {
      throw new Error('Cannot reach the Citadel agent on this machine');
    }
    
    const requestId = crypto.randomUUID();

    // First, get existing servers
    const { servers } = await listKnownServers({ cid });
    
    // Add or update the server
    const existingIndex = servers.findIndex(s => s.serverAddress === server.serverAddress);
    if (existingIndex >= 0) {
      servers[existingIndex] = { ...servers[existingIndex], ...server };
    } else {
      servers.push(server);
    }

    // Store back to LocalDB
    return failOnSocketLoss('StoreKnownServer', new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('Store known server request timed out'));
      }, TIMEOUT.LOCALDB_REQUEST_MS);

      // Set up event listener

      const handler = (raw: unknown) => {
        const message = narrowWebSocketMessage(raw);
        if (!message) return;

        const setKVSuccess = getVariant(message, 'LocalDBSetKVSuccess');
        const setKVFailure = getVariant(message, 'LocalDBSetKVFailure');
        if (setKVSuccess && setKVSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve();
        } else if (setKVFailure && setKVFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error((setKVFailure.message as string) || 'Failed to store known server'));
        }
      };

      // Listen for WebSocket messages
      eventEmitter.on('websocket-message', handler);

      // Convert servers array to JSON bytes
      const jsonStr = JSON.stringify({ servers });
      const bytes = stringToBytes(jsonStr);

      // Send the request
      const request = {
        LocalDBSetKV: {
          request_id: requestId,
          cid: BigInt(cid || '0'),
          peer_cid: null,
          key: 'known_servers',
          value: bytes
        }
      };

      websocketService.sendMessage(request as unknown as Record<string, unknown>)
        .catch(error => {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(error);
        });
    }));
  } catch (error) {
    debugLog('ServerUtils', 'Error in storeKnownServer:', error);
    throw error;
  }
}

// The localStorage recent-servers fallback lives in recent-servers.ts;
// re-exported so existing import sites keep working.
export { saveRecentServer, getRecentServers } from './recent-servers';
