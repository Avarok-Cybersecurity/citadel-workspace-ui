/**
 * LocalDB Operations
 *
 * Handles LocalDB key-value storage operations via the internal service.
 */

import { requestResponse } from './request-response';
import { TIMEOUT } from '../timeout-constants';

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
      LocalDBGetKV: { request_id: requestId, cid, peer_cid: null, key }
    };

    return requestResponse<{ value: number[] }>({
      request, requestId, timeoutMs: TIMEOUT.LOCALDB_REQUEST_MS,
      sendRequest: this.config.sendRequest,
      operationName: 'LocalDBGetKV',
      matcher: {
        matchSuccess: (msg) => {
          const r = msg as { LocalDBGetKVSuccess?: { request_id: string; value: number[] } };
          return r.LocalDBGetKVSuccess?.request_id === requestId
            ? { value: r.LocalDBGetKVSuccess.value }
            : undefined;
        },
        matchFailure: (msg) => {
          const r = msg as { LocalDBGetKVFailure?: { request_id: string; message?: string } };
          return r.LocalDBGetKVFailure?.request_id === requestId
            ? (r.LocalDBGetKVFailure.message || 'LocalDB get failed')
            : undefined;
        },
      },
    });
  }

  async set(cid: bigint, key: string, value: number[]): Promise<void> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBSetKV: { request_id: requestId, cid, peer_cid: null, key, value }
    };

    await requestResponse<true>({
      request, requestId, timeoutMs: TIMEOUT.LOCALDB_REQUEST_MS,
      sendRequest: this.config.sendRequest,
      operationName: 'LocalDBSetKV',
      matcher: {
        matchSuccess: (msg) => {
          const r = msg as { LocalDBSetKVSuccess?: { request_id: string } };
          return r.LocalDBSetKVSuccess?.request_id === requestId ? true : undefined;
        },
        matchFailure: (msg) => {
          const r = msg as { LocalDBSetKVFailure?: { request_id: string; message?: string } };
          return r.LocalDBSetKVFailure?.request_id === requestId
            ? (r.LocalDBSetKVFailure.message || 'LocalDB set failed')
            : undefined;
        },
      },
    });
  }

  async delete(cid: bigint, key: string): Promise<void> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBDeleteKV: { request_id: requestId, cid, peer_cid: null, key }
    };

    await requestResponse<true>({
      request, requestId, timeoutMs: TIMEOUT.LOCALDB_REQUEST_MS,
      sendRequest: this.config.sendRequest,
      operationName: 'LocalDBDeleteKV',
      matcher: {
        matchSuccess: (msg) => {
          const r = msg as { LocalDBDeleteKVSuccess?: { request_id: string } };
          return r.LocalDBDeleteKVSuccess?.request_id === requestId ? true : undefined;
        },
        matchFailure: (msg) => {
          const r = msg as { LocalDBDeleteKVFailure?: { request_id: string; message?: string } };
          return r.LocalDBDeleteKVFailure?.request_id === requestId
            ? (r.LocalDBDeleteKVFailure.message || 'LocalDB delete failed')
            : undefined;
        },
      },
    });
  }

  async listKeys(cid: bigint, prefix?: string): Promise<string[]> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      LocalDBGetAllKV: { request_id: requestId, cid, peer_cid: null }
    };

    return requestResponse<string[]>({
      request, requestId, timeoutMs: TIMEOUT.LOCALDB_REQUEST_MS,
      sendRequest: this.config.sendRequest,
      operationName: 'LocalDBGetAllKV',
      matcher: {
        matchSuccess: (msg) => {
          const r = msg as { LocalDBGetAllKVSuccess?: { request_id: string; map?: Record<string, unknown> } };
          if (r.LocalDBGetAllKVSuccess?.request_id !== requestId) return undefined;
          const map = r.LocalDBGetAllKVSuccess.map || {};
          let keys = Object.keys(map);
          if (prefix) {
            keys = keys.filter(k => k.startsWith(prefix));
          }
          return keys;
        },
        matchFailure: (msg) => {
          const r = msg as { LocalDBGetAllKVFailure?: { request_id: string; message?: string } };
          return r.LocalDBGetAllKVFailure?.request_id === requestId
            ? (r.LocalDBGetAllKVFailure.message || 'LocalDB get all failed')
            : undefined;
        },
      },
    });
  }
}
