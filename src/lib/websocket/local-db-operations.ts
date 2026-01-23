/**
 * LocalDB Operations
 *
 * Handles LocalDB key-value storage operations via the internal service.
 */

import { eventEmitter } from '../event-emitter';

export interface LocalDBConfig {
  init: () => Promise<void>;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
}

export class LocalDBOperations {
  private readonly config: LocalDBConfig;

  constructor(config: LocalDBConfig) {
    this.config = config;
  }

  async get(cid: bigint, key: string): Promise<{ value: number[] } | null> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBGetKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null,
        key
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBGetKV request timed out'));
      }, 5000);

      const handleMessage = (message: Record<string, unknown>) => {
        const msg = message as { LocalDBGetKVSuccess?: { request_id: string; value: number[] }; LocalDBGetKVFailure?: { request_id: string; message?: string } };
        if (msg.LocalDBGetKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve({ value: msg.LocalDBGetKVSuccess.value });
        } else if (msg.LocalDBGetKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(msg.LocalDBGetKVFailure.message || 'LocalDB get failed'));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.config.sendRequest(request, requestId).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  async set(cid: bigint, key: string, value: number[]): Promise<void> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBSetKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null,
        key,
        value
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBSetKV request timed out'));
      }, 5000);

      const handleMessage = (message: Record<string, unknown>) => {
        const msg = message as { LocalDBSetKVSuccess?: { request_id: string }; LocalDBSetKVFailure?: { request_id: string; message?: string } };
        if (msg.LocalDBSetKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve();
        } else if (msg.LocalDBSetKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(msg.LocalDBSetKVFailure.message || 'LocalDB set failed'));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.config.sendRequest(request, requestId).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  async delete(cid: bigint, key: string): Promise<void> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBDeleteKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null,
        key
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBDeleteKV request timed out'));
      }, 5000);

      const handleMessage = (message: Record<string, unknown>) => {
        const msg = message as { LocalDBDeleteKVSuccess?: { request_id: string }; LocalDBDeleteKVFailure?: { request_id: string; message?: string } };
        if (msg.LocalDBDeleteKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve();
        } else if (msg.LocalDBDeleteKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(msg.LocalDBDeleteKVFailure.message || 'LocalDB delete failed'));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.config.sendRequest(request, requestId).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  async listKeys(cid: bigint, prefix?: string): Promise<string[]> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBGetAllKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBGetAllKV request timed out'));
      }, 5000);

      const handleMessage = (message: Record<string, unknown>) => {
        const msg = message as { LocalDBGetAllKVSuccess?: { request_id: string; map?: Record<string, unknown> }; LocalDBGetAllKVFailure?: { request_id: string; message?: string } };
        if (msg.LocalDBGetAllKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          const map = msg.LocalDBGetAllKVSuccess.map || {};
          let keys = Object.keys(map);
          if (prefix) {
            keys = keys.filter(k => k.startsWith(prefix));
          }
          resolve(keys);
        } else if (msg.LocalDBGetAllKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(msg.LocalDBGetAllKVFailure.message || 'LocalDB get all failed'));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.config.sendRequest(request, requestId).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }
}
