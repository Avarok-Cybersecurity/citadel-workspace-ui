/**
 * Peer Registration Store - Persistence
 *
 * LocalDB read/write operations for pending and outgoing requests.
 * Uses generic helpers to avoid duplication between pending/outgoing variants.
 */

import { websocketService } from '../websocket-service';
import { stringToBytes, bytesToString } from '../utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';
import type { PendingPeerRequest, OutgoingPeerRequest, KVPendingEntry } from './types';
import {
  STORAGE_KEY,
  OUTGOING_STORAGE_KEY,
  REQUEST_TIMEOUT_MS
} from './constants';

/** Generic LocalDB set operation */
async function localDBSet(
  key: string,
  data: unknown[],
  pendingKVRequests: Map<string, KVPendingEntry>,
  label: string
): Promise<void> {
  const requestId = crypto.randomUUID();
  const { safeJSONStringify } = await import('../storage-utils');
  const valueStr = safeJSONStringify(data);

  const request = {
    LocalDBSetKV: {
      request_id: requestId, cid: 0n, peer_cid: null,
      key, value: stringToBytes(valueStr)
    }
  };

  return new Promise<void>((resolve, reject) => {
    pendingKVRequests.set(requestId, { resolve: () => resolve(), reject });
    const client = websocketService.getClient();
    if (!client) {
      pendingKVRequests.delete(requestId);
      debugLog('PeerRegistrationStore', `No WebSocket client - skipping ${label} persist`);
      resolve();
      return;
    }
    client.sendDirectToInternalService(request).catch(error => {
      debugLog('PeerRegistrationStore', `Failed to persist ${label}:`, error);
      pendingKVRequests.delete(requestId);
      reject(error);
    });
    setTimeout(() => {
      if (pendingKVRequests.has(requestId)) {
        pendingKVRequests.delete(requestId);
        debugLog('PeerRegistrationStore', `${label} persist timed out`);
        resolve(undefined);
      }
    }, REQUEST_TIMEOUT_MS);
  });
}

/** Generic LocalDB get operation */
async function localDBGet<T>(
  key: string,
  pendingKVRequests: Map<string, KVPendingEntry>,
  onLoaded: (data: T[]) => Promise<void>,
  label: string
): Promise<void> {
  const requestId = crypto.randomUUID();
  const request = {
    LocalDBGetKV: {
      request_id: requestId, cid: 0n, peer_cid: null, key
    }
  };

  return new Promise((resolve) => {
    pendingKVRequests.set(requestId, {
      resolve: async (data: unknown) => {
        if (data && Array.isArray(data)) {
          await onLoaded(data as T[]);
        }
        resolve(undefined);
      },
      reject: () => {
        debugLog('PeerRegistrationStore', `Failed to load ${label} from LocalDB`);
        resolve(undefined);
      }
    });
    const client = websocketService.getClient();
    if (!client) {
      pendingKVRequests.delete(requestId);
      debugLog('PeerRegistrationStore', `No WebSocket client - skipping ${label} load`);
      resolve(undefined);
      return;
    }
    client.sendDirectToInternalService(request).catch(error => {
      debugLog('PeerRegistrationStore', `Failed to send ${label} load request:`, error);
      pendingKVRequests.delete(requestId);
      resolve(undefined);
    });
    setTimeout(() => {
      if (pendingKVRequests.has(requestId)) {
        pendingKVRequests.delete(requestId);
        debugLog('PeerRegistrationStore', `${label} load timed out`);
        resolve(undefined);
      }
    }, REQUEST_TIMEOUT_MS);
  });
}

// -- Public API --

export function persistPendingToLocalDB(
  requests: PendingPeerRequest[],
  kv: Map<string, KVPendingEntry>
): Promise<void> {
  return localDBSet(STORAGE_KEY, requests, kv, 'pending');
}

export function loadPendingFromLocalDB(
  kv: Map<string, KVPendingEntry>,
  onLoaded: (requests: PendingPeerRequest[]) => Promise<void>
): Promise<void> {
  return localDBGet<PendingPeerRequest>(STORAGE_KEY, kv, onLoaded, 'pending');
}

export function persistOutgoingToLocalDB(
  requests: OutgoingPeerRequest[],
  kv: Map<string, KVPendingEntry>
): Promise<void> {
  return localDBSet(OUTGOING_STORAGE_KEY, requests, kv, 'outgoing');
}

export function loadOutgoingFromLocalDB(
  kv: Map<string, KVPendingEntry>,
  onLoaded: (requests: OutgoingPeerRequest[]) => Promise<void>
): Promise<void> {
  return localDBGet<OutgoingPeerRequest>(
    OUTGOING_STORAGE_KEY, kv,
    async (data) => {
      const valid = data.filter(r => r.toCid && r.fromCid);
      const invalidCount = data.length - valid.length;
      if (invalidCount > 0) {
        debugLog('PeerRegistrationStore', `Filtered out ${invalidCount} invalid outgoing requests`);
      }
      await onLoaded(valid);
    },
    'outgoing'
  );
}

/** Resolve a LocalDB get KV response */
export function resolveKVResponse(
  kv: Map<string, KVPendingEntry>,
  requestId: string,
  value: number[] | undefined
): void {
  const pending = kv.get(requestId);
  if (!pending) return;
  kv.delete(requestId);
  try {
    if (value && value.length > 0) {
      pending.resolve(JSON.parse(bytesToString(value)));
    } else {
      pending.resolve(null);
    }
  } catch (error) {
    debugLog('PeerRegistrationStore', 'Failed to parse LocalDB value:', error);
    pending.resolve(null);
  }
}

/** Resolve a LocalDB set KV success */
export function resolveKVSetSuccess(
  kv: Map<string, KVPendingEntry>,
  requestId: string
): void {
  const pending = kv.get(requestId);
  if (pending) { kv.delete(requestId); pending.resolve(undefined); }
}

/** Reject a LocalDB KV failure */
export function rejectKVFailure(
  kv: Map<string, KVPendingEntry>,
  requestId: string,
  message: string
): void {
  const pending = kv.get(requestId);
  if (pending) { kv.delete(requestId); pending.reject(new Error(message || 'LocalDB operation failed')); }
}
