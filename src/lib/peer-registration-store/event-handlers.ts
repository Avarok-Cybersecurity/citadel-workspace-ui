/**
 * Peer Registration Store - Event Handlers
 *
 * WebSocket message routing and session/leader event handling.
 * Extracted from service.ts to keep the orchestrator under 250 lines.
 */

import { eventEmitter } from '../event-emitter';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage, hasVariant, getVariant } from '@/lib/ws-message-boundary';
import type { KVPendingEntry } from './types';
import {
  resolveKVResponse,
  resolveKVSetSuccess,
  rejectKVFailure,
} from './persistence';

/** Callbacks the event handlers need from the store */
export interface StoreCallbacks {
  refreshNotificationsForCurrentSession: () => Promise<void>;
  startPollLoop: () => void;
  stopPollLoop: () => void;
  removeOutgoingRequestByPeer: (peerCid: bigint) => Promise<void>;
  removeRequestByPeerCid: (peerCid: bigint) => Promise<void>;
  isInitialized: () => boolean;
  getPendingKVRequests: () => Map<string, KVPendingEntry>;
}

/**
 * Register all event listeners for the store.
 * Called once during construction.
 */
export function setupEventListeners(callbacks: StoreCallbacks): void {
  eventEmitter.on('session-selected', () => {
    debugLog('PeerRegistrationStore', 'Session switched, refreshing notifications');
    setTimeout(() => {
      runAsyncSetup(async () => { await callbacks.refreshNotificationsForCurrentSession(); });
    }, 100);
  });

  eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
    debugLog('PeerRegistrationStore', `Leader changed - isLeader: ${data.isLeader}`);
    if (data.isLeader) { if (callbacks.isInitialized()) callbacks.startPollLoop(); }
    else { callbacks.stopPollLoop(); }
  });

  eventEmitter.on('websocket-message', (raw: unknown) => {
    handleWebSocketMessage(raw, callbacks);
  });
}

function handleWebSocketMessage(raw: unknown, callbacks: StoreCallbacks): void {
  const message = narrowWebSocketMessage(raw);
  if (!message) return;

  const kv: Map<string, KVPendingEntry> = callbacks.getPendingKVRequests();

  if (hasVariant(message, 'LocalDBSetKVSuccess')) {
    const { request_id } = getVariant(message, 'LocalDBSetKVSuccess')!;
    resolveKVSetSuccess(kv, request_id as string);
  }

  if (hasVariant(message, 'LocalDBGetKVSuccess')) {
    const v: Record<string, unknown> = getVariant(message, 'LocalDBGetKVSuccess')!;
    resolveKVResponse(kv, v.request_id as string, v.value as number[] | undefined);
  }

  if (hasVariant(message, 'LocalDBSetKVFailure') || hasVariant(message, 'LocalDBGetKVFailure')) {
    const failure: Record<string, unknown> = ((message as Record<string, unknown>).LocalDBSetKVFailure ||
      (message as Record<string, unknown>).LocalDBGetKVFailure) as Record<string, unknown>;
    rejectKVFailure(kv, failure.request_id as string, failure.message as string);
  }

  handlePeerRegistrationEvents(message, callbacks);
}

function handlePeerRegistrationEvents(
  message: NonNullable<ReturnType<typeof narrowWebSocketMessage>>,
  callbacks: StoreCallbacks
): void {
  if (hasVariant(message, 'PeerRegisterSuccess')) {
    const v: Record<string, unknown> = getVariant(message, 'PeerRegisterSuccess')!;
    const peer_cid: bigint | undefined = v.peer_cid as bigint | undefined;
    debugLog('PeerRegistrationStore', 'PeerRegisterSuccess received', {
      request_id: v.request_id,
      cid: (v.cid as bigint | undefined)?.toString(),
      peer_cid: peer_cid?.toString()
    });
    if (peer_cid !== undefined) {
      callbacks.removeOutgoingRequestByPeer(peer_cid).catch(
        (err: unknown) => debugLog('PeerRegistrationStore', 'removeOutgoingRequestByPeer failed:', err)
      );
    }
  }

  if (hasVariant(message, 'PeerRegisterFailure')) {
    const v: Record<string, unknown> = getVariant(message, 'PeerRegisterFailure')!;
    const peer_cid: bigint | undefined = v.peer_cid as bigint | undefined;
    debugLog('PeerRegistrationStore', 'PeerRegisterFailure received', {
      request_id: v.request_id,
      cid: (v.cid as bigint | undefined)?.toString(),
      peer_cid: peer_cid?.toString(),
      errorMsg: v.message
    });
    if (peer_cid !== undefined) {
      callbacks.removeOutgoingRequestByPeer(peer_cid).catch(
        (err: unknown) => debugLog('PeerRegistrationStore', 'removeOutgoingRequestByPeer failed:', err)
      );
    }
  }

  if (hasVariant(message, 'PeerConnectSuccess')) {
    const v: Record<string, unknown> = getVariant(message, 'PeerConnectSuccess')!;
    const peer_cid: bigint | undefined = v.peer_cid as bigint | undefined;
    if (peer_cid !== undefined) {
      debugLog('PeerRegistrationStore', `Clearing requests for connected peer ${peer_cid.toString()}`);
      callbacks.removeRequestByPeerCid(peer_cid).catch(
        (err: unknown) => debugLog('PeerRegistrationStore', 'removeRequestByPeerCid failed:', err)
      );
      callbacks.removeOutgoingRequestByPeer(peer_cid).catch(
        (err: unknown) => debugLog('PeerRegistrationStore', 'removeOutgoingRequestByPeer failed:', err)
      );
      eventEmitter.emit('peer-requests:updated');
    }
  }
}
