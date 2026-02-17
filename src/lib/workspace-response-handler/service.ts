/**
 * Workspace Response Handler - Service
 *
 * Singleton that listens for WebSocket messages, extracts workspace
 * protocol responses, and delegates to the appropriate handler group.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import type { WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';

import { extractWorkspaceResponse } from './message-extraction';
import { handleWorkspaceVariants, buildConnectionInfo } from './workspace-handlers';
import { handleGroupVariants } from './group-handlers';

/**
 * Handles workspace protocol responses and emits appropriate events.
 */
export class WorkspaceResponseHandler {
  private static instance: WorkspaceResponseHandler;

  private constructor() {
    this.setupMessageHandler();
  }

  public static getInstance(): WorkspaceResponseHandler {
    if (!WorkspaceResponseHandler.instance) {
      WorkspaceResponseHandler.instance = new WorkspaceResponseHandler();
    }
    return WorkspaceResponseHandler.instance;
  }

  private setupMessageHandler(): void {
    eventEmitter.on('websocket-message', (raw: unknown) => {
      const response = extractWorkspaceResponse(raw);
      if (response) {
        this.processWorkspaceResponse(response);
      }
    });
  }

  private processWorkspaceResponse(response: WorkspaceProtocolResponse): void {
    debugLog('WorkspaceResponseHandler', 'Processing workspace response', response);
    const connectionInfo = buildConnectionInfo();

    // Try workspace/member/node/permission handlers
    if (handleWorkspaceVariants(response, connectionInfo)) return;

    // Try group messaging handlers
    if (handleGroupVariants(response, connectionInfo)) return;

    // Unhandled
    debugLog('WorkspaceResponseHandler', 'Unhandled response type:', response);
    eventEmitter.emit('workspace:raw-response', response);
  }

  /**
   * Emit loading events before making requests.
   */
  public emitLoadingEvent(eventType: string, data?: { domainId?: string }): void {
    const connectionInfo = buildConnectionInfo();

    switch (eventType) {
      case 'workspace:loading':
        eventEmitter.emit('workspace:loading', connectionInfo);
        break;
      case 'nodes:loading':
        eventEmitter.emit('nodes:loading', connectionInfo);
        break;
      case 'members:loading':
        eventEmitter.emit('members:loading', {
          domainId: data?.domainId,
          connection: connectionInfo,
        });
        break;
    }
  }
}
