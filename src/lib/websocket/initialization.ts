/**
 * WebSocket Initialization
 *
 * Handles WASM client initialization, leader election, and WebSocket creation.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { WorkspaceClient, type WorkspaceClientConfig } from 'citadel-workspace-client-ts';
import type { InternalServiceResponse, InternalServiceRequest, ResponseType } from 'citadel-workspace-client-ts';
import { eventEmitter } from '../event-emitter';
import { broadcastChannelService } from '../broadcast-channel-service';
import { debugLog, errorLog } from '../debug-config';
import {
  instanceManager,
  leaderOutboundHandler,
  instanceInboundRouter
} from '../multi-instance';
import { INTERVAL } from '../timeout-constants';

// Global state key for preventing multiple WASM client initializations
export const GLOBAL_INIT_KEY = '__citadel_wasm_client_init__';

declare global {
  interface Window {
    [GLOBAL_INIT_KEY]?: {
      promise: Promise<void>;
      initialized: boolean;
      client: WorkspaceClient | null;
    };
  }
}

export interface InitializationConfig {
  websocketUrl: string;
  messageHandler?: (message: unknown) => void;
  errorHandler?: (error: Error) => void;
  onClientCreated: (client: WorkspaceClient) => void;
  onClientReset: () => void;
  releaseSession: (cid: bigint) => void;
}

export class WebSocketInitialization {
  private readonly config: InitializationConfig;

  constructor(config: InitializationConfig) {
    this.config = config;
  }

  /**
   * Wait for leader election to settle.
   * Returns when we know if we're leader or follower.
   */
  async waitForLeaderElection(): Promise<void> {
    debugLog('Initialization', `waitForLeaderElection: checking initial state isLeader=${instanceManager.isLeader}, leaderId=${instanceManager.leaderId}`);
    if (instanceManager.isLeader || instanceManager.leaderId) {
      debugLog('Initialization', `waitForLeaderElection: already decided, returning immediately`);
      return;
    }

    const ELECTION_TIMEOUT_MS = INTERVAL.LEADER_ELECTION_MS;
    debugLog('Initialization', `waitForLeaderElection: waiting up to ${ELECTION_TIMEOUT_MS}ms for leader election`);

    return new Promise<void>((resolve) => {
      let resolved = false;

      const handler = ({ isLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
        if (!resolved) {
          resolved = true;
          eventEmitter.off('instance:leader-changed', handler);
          debugLog('Initialization', `waitForLeaderElection: leader-changed event received: isLeader=${isLeader}, leaderId=${leaderId}`);
          resolve();
        }
      };

      eventEmitter.on('instance:leader-changed', handler);

      if (instanceManager.isLeader || instanceManager.leaderId) {
        if (!resolved) {
          resolved = true;
          eventEmitter.off('instance:leader-changed', handler);
          debugLog('Initialization', `waitForLeaderElection: decided during setup, isLeader=${instanceManager.isLeader}, leaderId=${instanceManager.leaderId}`);
          resolve();
        }
      }

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          eventEmitter.off('instance:leader-changed', handler);
          debugLog('Initialization', `waitForLeaderElection: TIMEOUT after ${ELECTION_TIMEOUT_MS}ms - no leader detected`);
          if (!instanceManager.isLeader && !instanceManager.leaderId) {
            debugLog('Initialization', `waitForLeaderElection: Will let InstanceChannel handle election`);
          }
          resolve();
        }
      }, ELECTION_TIMEOUT_MS);
    });
  }

  /**
   * Initialize as follower (no WebSocket).
   */
  initializeAsFollower(): void {
    debugLog('websocket', 'Follower tab: Skipping WebSocket creation, will proxy through leader');

    eventEmitter.on('instance:leader-changed', async ({ isLeader: newIsLeader }: { isLeader: boolean; leaderId: string }) => {
      if (newIsLeader) {
        debugLog('websocket', 'Became leader! Creating WebSocket connection...');
        await this.createWebSocketAsLeader();
      }
    });

    eventEmitter.emit('on-ws-connection-success');
    debugLog('websocket', 'Follower initialization complete');
  }

  /**
   * Create WebSocket connection when this tab is the leader.
   */
  async createWebSocketAsLeader(): Promise<WorkspaceClient> {
    const clientConfig: WorkspaceClientConfig = {
      websocketUrl: this.config.websocketUrl,
      messageHandler: (rawMessage: InternalServiceResponse) => {
        const message = rawMessage;
        debugLog('websocket', 'Message received from WASM client', message);

        if (instanceManager.isLeader) {
          instanceInboundRouter.routeMessage(message);
        } else {
          eventEmitter.emit('websocket-message', message);
        }

        if (broadcastChannelService.getIsLeader()) {
          const messageType = Object.keys(message)[0] as ResponseType | undefined;
          const cidRoutedTypes: ResponseType[] = ['MessageNotification', 'PeerRegisterNotification', 'PeerConnectNotification'];
          if (!messageType || !cidRoutedTypes.includes(messageType)) {
            broadcastChannelService.broadcastWorkspaceResponse(message);
          } else {
            debugLog('websocket', `Skipping legacy broadcast for CID-routed ${messageType} (handled by instanceInboundRouter)`);
          }
        }

        if (this.config.messageHandler) {
          this.config.messageHandler(message);
        }
      },
      errorHandler: this.config.errorHandler,
    };

    try {
      debugLog('websocket', 'Creating WorkspaceClient with config', clientConfig);
      const client = new WorkspaceClient(clientConfig);
      await client.init();

      eventEmitter.emit('on-ws-connection-success');

      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].client = client;
      }

      leaderOutboundHandler.setWebSocketSendFunction(async (message: unknown) => {
        await client.sendDirectToInternalService(message as InternalServiceRequest);
      });
      debugLog('websocket', 'Registered send function with leader outbound handler');

      this.setupDisconnectionHandler(client);
      this.setupSessionReleaseHandler();

      this.config.onClientCreated(client);

      debugLog('websocket', 'WASM client initialization completed successfully');
      return client;
    } catch (error) {
      errorLog('Error initializing WorkspaceClient:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
      eventEmitter.emit('connection-failure', { error: errorMessage });

      throw error;
    }
  }

  private setupDisconnectionHandler(client: WorkspaceClient): void {
    eventEmitter.on('websocket-disconnected', async () => {
      debugLog('websocket', 'WebSocket disconnected event received, stopping message processing and resetting state');
      client.stopMessageProcessing();
      try {
        await client.close();
        debugLog('websocket', 'WASM client closed successfully');
      } catch (closeError) {
        debugLog('websocket', 'WASM client close error (ignored):', closeError);
      }

      this.config.onClientReset();
      window[GLOBAL_INIT_KEY] = undefined;
      debugLog('websocket', 'WebSocket service state reset after disconnection');
    });
  }

  private setupSessionReleaseHandler(): void {
    eventEmitter.on('session:release-request', ({ cid }: { cid: bigint }) => {
      debugLog('websocket', `Session release requested for CID ${cid.toString()}`);
      this.config.releaseSession(cid);
    });
  }
}
