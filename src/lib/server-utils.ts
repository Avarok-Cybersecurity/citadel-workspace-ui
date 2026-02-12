import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { stringToBytes, bytesToString } from './utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';

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
    // Check if websocket service is already initialized
    const client = websocketService.getClient();
    
    if (!client) {
      // Don't try to initialize here - let ConnectionManager handle it
      debugLog('ServerUtils', 'WebSocket client not available yet, returning empty servers list');
      return { servers: [] };
    }
    
    const requestId = crypto.randomUUID();

    // Create a promise to wait for the response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('List known servers request timed out'));
      }, 5000);

      // Set up event listener
      const handler = (message: any) => {
        if (message.LocalDBGetAllKVSuccess && message.LocalDBGetAllKVSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          
          // Extract servers from the response
          const servers: StoredServer[] = [];
          const kvMap = message.LocalDBGetAllKVSuccess.map;
          
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
                  } else if (typeof value === 'object' && value.servers) {
                    servers.push(...value.servers);
                  }
                } catch (e) {
                  console.error('Error parsing server data:', e);
                }
              }
            });
          }
          
          resolve({ servers });
        } else if (message.LocalDBGetAllKVFailure && message.LocalDBGetAllKVFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(message.LocalDBGetAllKVFailure.message || 'Failed to get known servers'));
        }
      };

      // Listen for WebSocket messages
      eventEmitter.on('websocket-message', handler);

      // Send the request
      const request = {
        LocalDBGetAllKV: {
          request_id: requestId,
          cid: parseInt(options.cid) || 0,
          peer_cid: null
        }
      };

      client.sendDirectToInternalService(request)
        .catch(error => {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(error);
        });
    });
  } catch (error) {
    console.error('Error in listKnownServers:', error);
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
    const client = websocketService.getClient();
    
    if (!client) {
      throw new Error('WebSocket client not initialized');
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
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('Store known server request timed out'));
      }, 5000);

      // Set up event listener
      const handler = (message: any) => {
        if (message.LocalDBSetKVSuccess && message.LocalDBSetKVSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve();
        } else if (message.LocalDBSetKVFailure && message.LocalDBSetKVFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(message.LocalDBSetKVFailure.message || 'Failed to store known server'));
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
          cid: parseInt(cid) || 0,
          peer_cid: null,
          key: 'known_servers',
          value: bytes
        }
      };

      client.sendDirectToInternalService(request)
        .catch(error => {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(error);
        });
    });
  } catch (error) {
    console.error('Error in storeKnownServer:', error);
    throw error;
  }
}