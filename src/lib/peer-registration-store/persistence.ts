/**
 * Peer Registration Store - Persistence
 *
 * LocalDB read/write operations for pending and outgoing requests.
 * Uses generic helpers to avoid duplication between pending/outgoing variants.
 */

import { websocketService } from '../websocket-service';
import { stringToBytes, bytesToString } from '../utils/encoding-utils';
import { parsePersistedJSON } from '../storage-utils';

/**
 * Keys older builds wrote as bare strings via safeJSONStringify. New writes are
 * tagged, so this list only exists to rescue data already on disk.
 */
const PERSISTED_CID_FIELDS: readonly ["fromCid", "toCid", "cid", "peer_cid"] = ['fromCid', 'toCid', 'cid', 'peer_cid'] as const;
import { debugLog } from '@/lib/debug-config';
import type { PendingPeerRequest, OutgoingPeerRequest, KVPendingEntry } from './types';
import {
  STORAGE_KEY,
  OUTGOING_STORAGE_KEY,
  REQUEST_TIMEOUT_MS
} from './constants';
import {
  pendingKey,
  outgoingKey,
  hasLegacyPending,
  hasLegacyOutgoing,
  ownPending,
  ownOutgoing,
} from './storage-keys';

/** Generic LocalDB set operation */
async function localDBSet(
  key: string,
  data: unknown[],
  pendingKVRequests: Map<string, KVPendingEntry>,
  label: string
): Promise<void> {
  const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
  const { persistJSON } = await import('../storage-utils');
  const valueStr: string = persistJSON(data);

  const request: { LocalDBSetKV: { request_id: `${string}-${string}-${string}-${string}-${string}`; cid: bigint; peer_cid: null; key: string; value: number[]; }; } = {
    LocalDBSetKV: {
      request_id: requestId, cid: 0n, peer_cid: null,
      key, value: stringToBytes(valueStr)
    }
  };

  return new Promise<void>((resolve, reject) => {
    pendingKVRequests.set(requestId, { resolve: () => resolve(), reject });
    // `sendMessage`, not `getClient()`. A follower tab owns no client by
    // design, and the old branch RESOLVED SUCCESSFULLY on that path -- so an
    // incoming contact request that landed in a follower (they are CID-routed
    // to the tab owning the session, which is often not the leader) was never
    // written to LocalDB, and vanished on reload. Nothing failed; the request
    // simply ceased to exist.
    websocketService.sendMessage(request as unknown as Record<string, unknown>).catch(error => {
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
  const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
  const request: { LocalDBGetKV: { request_id: `${string}-${string}-${string}-${string}-${string}`; cid: bigint; peer_cid: null; key: string; }; } = {
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
    // See the persist path above: skipping this in a follower silently loaded
    // nothing, so a reload of the tab holding a pending request lost it.
    websocketService.sendMessage(request as unknown as Record<string, unknown>).catch(error => {
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
  return localDBSet(pendingKey(), requests, kv, 'pending');
}

/**
 * Load this account's incoming requests, from its own key and — once — from the
 * shared key older builds wrote.
 *
 * Both reads are filtered by owner. The scoped key cannot contain anyone else's
 * and the filter is free there; the legacy key contains EVERY account's, and
 * without it the second account on a device sees, and can accept, a contact
 * request addressed to the first.
 */
export function loadPendingFromLocalDB(
  kv: Map<string, KVPendingEntry>,
  onLoaded: (requests: PendingPeerRequest[]) => Promise<void>
): Promise<void> {
  return localDBGet<PendingPeerRequest>(
    pendingKey(), kv,
    async (data) => {
      await onLoaded(ownPending(data));
    },
    'pending',
  ).then(() => {
    if (!hasLegacyPending()) return;
    return localDBGet<PendingPeerRequest>(
      STORAGE_KEY, kv,
      async (data) => {
        const mine: PendingPeerRequest[] = ownPending(data);
        if (mine.length > 0) await onLoaded(mine);
      },
      'pending (legacy)',
    );
  });
}

export function persistOutgoingToLocalDB(
  requests: OutgoingPeerRequest[],
  kv: Map<string, KVPendingEntry>
): Promise<void> {
  return localDBSet(outgoingKey(), requests, kv, 'outgoing');
}

export function loadOutgoingFromLocalDB(
  kv: Map<string, KVPendingEntry>,
  onLoaded: (requests: OutgoingPeerRequest[]) => Promise<void>
): Promise<void> {
  const accept = async (data: OutgoingPeerRequest[]): Promise<void> => {
    const valid: OutgoingPeerRequest[] = data.filter(r => r.toCid && r.fromCid);
    const invalidCount: number = data.length - valid.length;
    if (invalidCount > 0) {
      debugLog('PeerRegistrationStore', `Filtered out ${invalidCount} invalid outgoing requests`);
    }
    await onLoaded(ownOutgoing(valid));
  };

  return localDBGet<OutgoingPeerRequest>(outgoingKey(), kv, accept, 'outgoing').then(() => {
    if (!hasLegacyOutgoing()) return;
    return localDBGet<OutgoingPeerRequest>(
      OUTGOING_STORAGE_KEY, kv,
      async (data) => {
        const mine: OutgoingPeerRequest[] = ownOutgoing(data.filter(r => r.toCid && r.fromCid));
        if (mine.length > 0) await onLoaded(mine);
      },
      'outgoing (legacy)',
    );
  });
}

/** Resolve a LocalDB get KV response */
export function resolveKVResponse(
  kv: Map<string, KVPendingEntry>,
  requestId: string,
  value: number[] | undefined
): void {
  const pending: KVPendingEntry | undefined = kv.get(requestId);
  if (!pending) return;
  kv.delete(requestId);
  try {
    if (value && value.length > 0) {
      // parsePersistedJSON, not JSON.parse: fromCid/toCid/cid/peer_cid are
      // typed bigint and every lookup in state.ts compares them with ===, so
      // strings coming back here made incoming requests invisible to the UI
      // and the badge, and outgoing ones impossible to dedupe or remove.
      pending.resolve(parsePersistedJSON(bytesToString(value), PERSISTED_CID_FIELDS));
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
  const pending: KVPendingEntry | undefined = kv.get(requestId);
  if (pending) { kv.delete(requestId); pending.resolve(undefined); }
}

/** Reject a LocalDB KV failure */
export function rejectKVFailure(
  kv: Map<string, KVPendingEntry>,
  requestId: string,
  message: string
): void {
  const pending: KVPendingEntry | undefined = kv.get(requestId);
  if (pending) { kv.delete(requestId); pending.reject(new Error(message || 'LocalDB operation failed')); }
}
