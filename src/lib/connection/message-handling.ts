/**
 * Connection Message Handling
 *
 * Handles WebSocket message routing and response resolution
 * for the ConnectionManager.
 */

import type { ConnectionState } from './state';
import type { ConnectionIO } from './io';
import type { WebSocketMessage } from '@/types/ws-message-types';
import { debugLog } from '@/lib/debug-config';

/**
 * Route an incoming WebSocket message to the appropriate handler.
 * Resolves pending requests and processes auth/disconnect events.
 */
export async function handleWebSocketMessage(
  message: WebSocketMessage,
  state: ConnectionState,
  io: ConnectionIO,
  onSuccessfulConnection: (cid: bigint, shouldUpdate: boolean) => Promise<void>,
  onConnectFailure: (failure: { message?: string }) => Promise<void>,
): Promise<void> {
  const msg = message as Record<string, Record<string, unknown> | undefined>;

  // Handle LocalDB responses
  if (msg.LocalDBSetKVSuccess) {
    resolveRequest(msg.LocalDBSetKVSuccess.request_id as string, msg.LocalDBSetKVSuccess, state);
  } else if (msg.LocalDBSetKVFailure) {
    rejectRequest(msg.LocalDBSetKVFailure.request_id as string, msg.LocalDBSetKVFailure.message as string, state);
  } else if (msg.LocalDBGetAllKVSuccess) {
    resolveRequest(msg.LocalDBGetAllKVSuccess.request_id as string, msg.LocalDBGetAllKVSuccess, state);
  } else if (msg.LocalDBGetAllKVFailure) {
    rejectRequest(msg.LocalDBGetAllKVFailure.request_id as string, msg.LocalDBGetAllKVFailure.message as string, state);
  } else if (msg.GetSessionsResponse) {
    resolveRequest(msg.GetSessionsResponse.request_id as string, msg.GetSessionsResponse, state);
  } else if (msg.ConnectionManagementSuccess) {
    debugLog('ConnectionService', 'ConnectionManager: Received ConnectionManagementSuccess');
    resolveRequest(msg.ConnectionManagementSuccess.request_id as string, message, state);
  } else if (msg.ConnectionManagementFailure) {
    debugLog('ConnectionService', 'ConnectionManager: Received ConnectionManagementFailure');
    resolveRequest(msg.ConnectionManagementFailure.request_id as string, message, state);
  }

  // Handle successful registration/connection
  const response = (msg.Response || msg) as Record<string, Record<string, unknown> | undefined>;
  if (response.RegisterSuccess || response.ConnectSuccess) {
    await handleAuthResponse(response, state, io, onSuccessfulConnection);
  }

  // Handle successful connection management
  const cmSuccess = (response.ConnectionManagementSuccess as Record<string, unknown> | undefined);
  if (cmSuccess) {
    await handleConnectionManagementResponse(cmSuccess, state, io, onSuccessfulConnection);
  }

  // Handle disconnect notifications
  const disconnectNotification = (response.DisconnectNotification as Record<string, unknown> | undefined);
  if (disconnectNotification) {
    debugLog('ConnectionService', 'ConnectionManager: Received DisconnectNotification for CID:', disconnectNotification.cid);
    state.invalidateCache();
  }

  // Handle connection failures
  if (response.ConnectFailure) {
    await onConnectFailure(response.ConnectFailure as { message?: string });
  }
}

async function handleAuthResponse(
  response: Record<string, Record<string, unknown> | undefined>,
  state: ConnectionState,
  io: ConnectionIO,
  onSuccessfulConnection: (cid: bigint, shouldUpdate: boolean) => Promise<void>,
): Promise<void> {
  const cid = (response.RegisterSuccess as Record<string, unknown> | undefined)?.cid
    || (response.ConnectSuccess as Record<string, unknown> | undefined)?.cid;
  const requestId = (response.RegisterSuccess as Record<string, unknown> | undefined)?.request_id
    || (response.ConnectSuccess as Record<string, unknown> | undefined)?.request_id;
  const cidBigInt = cid as bigint | undefined;
  const reqId = requestId as string | undefined;
  debugLog('ConnectionService', `ConnectionManager: Received registration/connection success, CID=${cidBigInt?.toString()}, request_id=${reqId}`);

  const hasPendingRequest = reqId && state.hasPendingRequest(reqId);
  const tabSelection = await io.getSelectedUser();
  const isOurSession = cidBigInt && tabSelection?.selectedCid === cidBigInt;
  const isFreshTab = !tabSelection?.selectedCid && !state.currentConnectionInfo;

  if (hasPendingRequest || isOurSession || isFreshTab) {
    debugLog('ConnectionService', `ConnectionManager: Processing connection success (hasPending=${hasPendingRequest}, isOurSession=${isOurSession}, isFreshTab=${isFreshTab})`);
    state.invalidateCache();
    if (cidBigInt) {
      debugLog('ConnectionService', `ConnectionManager: Calling handleSuccessfulConnection for CID=${cidBigInt.toString()}`);
      await onSuccessfulConnection(cidBigInt, false);
    }
  } else {
    debugLog('ConnectionService', `ConnectionManager: Ignoring connection success - not our session (requestId=${reqId}, ourCid=${tabSelection?.selectedCid?.toString()}, currentCid=${state.currentConnectionInfo?.cid?.toString()})`);
  }
}

async function handleConnectionManagementResponse(
  cmSuccess: Record<string, unknown>,
  state: ConnectionState,
  io: ConnectionIO,
  onSuccessfulConnection: (cid: bigint, shouldUpdate: boolean) => Promise<void>,
): Promise<void> {
  const cmReqId = cmSuccess.request_id as string | undefined;
  const cmCid = cmSuccess.cid as bigint | undefined;
  debugLog('ConnectionService', 'ConnectionManager: Received ConnectionManagementSuccess, request_id:', cmReqId, 'cid:', cmCid?.toString());

  const hasPendingRequest = cmReqId && state.hasPendingRequest(cmReqId);
  const tabSelection = await io.getSelectedUser();
  const isOurSession = cmCid && tabSelection?.selectedCid === cmCid;
  const isFreshTab = !tabSelection?.selectedCid && !state.currentConnectionInfo;

  if (hasPendingRequest || isOurSession || isFreshTab) {
    debugLog('ConnectionService', 'ConnectionManager: Processing ConnectionManagementSuccess (hasPending:', hasPendingRequest, ', isOurSession:', isOurSession, ', isFreshTab:', isFreshTab, ')');
    state.invalidateCache();
    if (cmCid) {
      debugLog('ConnectionService', 'ConnectionManager: Updating connection info with claimed session CID:', cmCid);
      await onSuccessfulConnection(cmCid, false);
    }
  } else {
    debugLog('ConnectionService', 'ConnectionManager: Ignoring ConnectionManagementSuccess - not our session');
  }
}

export function resolveRequest(requestId: string, data: unknown, state: ConnectionState): void {
  const pending = state.getPendingRequest(requestId);
  if (pending) {
    pending.resolve(data);
    state.deletePendingRequest(requestId);
  }
}

export function rejectRequest(requestId: string, message: string, state: ConnectionState): void {
  const pending = state.getPendingRequest(requestId);
  if (pending) {
    pending.reject(new Error(message));
    state.deletePendingRequest(requestId);
  }
}
