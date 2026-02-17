/**
 * Leader Proxy Handlers
 *
 * Handles proxy requests from follower instances to the leader.
 * Each handler processes a specific proxy type (workspace request,
 * openMessenger, ensureMessenger, sendP2PMessage).
 */

import type { ProxyResponseData } from './outbound-queue-types';
import type { WorkspaceProtocolRequest } from 'citadel-workspace-client-ts';
import { debugLog } from '@/lib/debug-config';

interface ProxyRequest {
  requestId: string;
  senderInstanceId: string;
  payload: Record<string, unknown>;
}

type SendAckFn = (
  targetInstanceId: string,
  requestId: string,
  status: 'processed' | 'error',
  error?: string,
  data?: ProxyResponseData
) => void;

async function getWebSocketClient() {
  const { websocketService } = await import('../websocket-service');
  return websocketService.getClient();
}

export async function handleWorkspaceRequestProxy(
  request: ProxyRequest,
  sendAck: SendAckFn
): Promise<void> {
  debugLog('LeaderProxyHandlers', `Handling workspace request proxy from ${request.senderInstanceId}`);

  const client = await getWebSocketClient();
  if (!client) {
    debugLog('LeaderProxyHandlers', 'No WASM client available for workspace request');
    sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
    return;
  }

  const cid = BigInt(request.payload.cid as string | number | bigint | boolean);
  await client.sendWorkspaceRequest(cid, request.payload.request as WorkspaceProtocolRequest);

  sendAck(request.senderInstanceId, request.requestId, 'processed');
  debugLog('LeaderProxyHandlers', `Workspace request proxy processed for ${request.requestId}`);
}

export async function handleOpenMessengerProxy(
  request: ProxyRequest,
  sendAck: SendAckFn
): Promise<void> {
  debugLog('LeaderProxyHandlers', `Handling openMessenger proxy from ${request.senderInstanceId}`);

  const client = await getWebSocketClient();
  if (!client) {
    debugLog('LeaderProxyHandlers', 'No WASM client available for openMessenger');
    sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
    return;
  }

  await client.openMessengerFor(request.payload.cid as string);

  sendAck(request.senderInstanceId, request.requestId, 'processed');
  debugLog('LeaderProxyHandlers', `openMessenger proxy processed for ${request.requestId}`);
}

export async function handleEnsureMessengerProxy(
  request: ProxyRequest,
  sendAck: SendAckFn
): Promise<void> {
  debugLog('LeaderProxyHandlers', `Handling ensureMessenger proxy from ${request.senderInstanceId}`);

  const client = await getWebSocketClient();
  if (!client) {
    debugLog('LeaderProxyHandlers', 'No WASM client available for ensureMessenger');
    sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
    return;
  }

  const wasOpened = await client.ensureMessengerOpen(request.payload.cid as string);

  sendAck(request.senderInstanceId, request.requestId, 'processed', undefined, { wasOpened });
  debugLog('LeaderProxyHandlers', `ensureMessenger proxy processed for ${request.requestId}`);
}

export async function handleSendP2PMessageProxy(
  request: ProxyRequest,
  sendAck: SendAckFn
): Promise<void> {
  debugLog('LeaderProxyHandlers', `Handling sendP2PMessage proxy from ${request.senderInstanceId}`);

  const client = await getWebSocketClient();
  if (!client) {
    debugLog('LeaderProxyHandlers', 'No WASM client available for sendP2PMessage');
    sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
    return;
  }

  const messageBytes = new Uint8Array(request.payload.message as ArrayLike<number>);
  await client.sendP2PMessageReliable(
    request.payload.localCid as string,
    request.payload.peerCid as string,
    messageBytes,
    request.payload.securityLevel as 'Standard' | 'Reinforced' | 'High' | 'Extreme' | undefined
  );

  sendAck(request.senderInstanceId, request.requestId, 'processed');
  debugLog('LeaderProxyHandlers', `sendP2PMessage proxy processed for ${request.requestId}`);
}
