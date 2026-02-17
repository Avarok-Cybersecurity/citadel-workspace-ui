/**
 * WebSocket Service - Request Sending
 *
 * Core request dispatch logic for leader/follower architecture.
 * Leader sends directly via WebSocket; follower proxies through leader.
 */

import type { InternalServiceRequest } from 'citadel-workspace-client-ts';
import { debugLog } from '../debug-config';
import { instanceManager, instanceChannel, instanceInboundRouter } from '../multi-instance';
import type { WebSocketServiceCore } from './core';

/**
 * SINGLE-WEBSOCKET ARCHITECTURE: Send a request to the internal service.
 * - Leader: Sends directly via WebSocket
 * - Follower: Proxies through leader via BroadcastChannel
 */
export async function sendRequest(
  service: WebSocketServiceCore,
  request: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  await service.init();

  const messageType = Object.keys(request)[0] || 'unknown';
  debugLog('WebSocketService', `_sendRequest: isLeader=${instanceManager.isLeader}, leaderId=${instanceManager.leaderId}, instanceId=${instanceManager.instanceId}, msgType=${messageType}`);

  if (instanceManager.isLeader) {
    if (!service.client) {
      debugLog('WebSocketService', `Leader without client, cannot send ${messageType}`);
      throw new Error('WebSocket client not available (leader without client)');
    }
    debugLog('WebSocketService', `[Leader] Sending ${messageType} directly`);
    await service.client.sendDirectToInternalService(request as InternalServiceRequest);
  } else {
    debugLog('WebSocketService', `[Follower] Proxying ${messageType} through leader ${instanceManager.leaderId}`);
    const id = requestId || crypto.randomUUID();

    instanceInboundRouter.registerPendingRequest(id, instanceManager.instanceId);

    const result = await instanceChannel.sendToLeader(request, id);

    if (result.status === 'error') {
      debugLog('WebSocketService', `Follower proxy failed for ${messageType}: ${result.error}`);
      throw new Error(`Leader failed to send request: ${result.error}`);
    }

    debugLog('WebSocketService', `[Follower] Request ${messageType} proxied successfully`);
  }
}
