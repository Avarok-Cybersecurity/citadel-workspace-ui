/**
 * WebSocket Initialization
 *
 * Handles WASM client initialization, leader election, and WebSocket creation.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { WorkspaceClient, type WorkspaceClientConfig } from 'citadel-workspace-client-ts';
import type { InternalServiceResponse, InternalServiceRequest, ResponseType } from 'citadel-workspace-client-ts';
import { installLeadershipListener } from './leadership-listener';
import { eventEmitter } from '../event-emitter';
import { broadcastChannelService } from '../broadcast-channel-service';
import { debugLog, errorLog } from '../debug-config';
import {
  setupDisconnectionHandler as setupDisconnection,
  setupSessionReleaseHandler as setupSessionRelease,
  closeLeaderSocket,
} from './leader-socket-teardown';
import {
  instanceManager,
  leaderOutboundHandler,
  instanceInboundRouter
} from '../multi-instance';
import { CID_ROUTED_NOTIFICATIONS } from '../multi-instance/routing-rules';
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
  private leadershipListenerRegistered = false;

  private readonly config: InitializationConfig;
  /** Owned while leader, so demotion can close it; `creating` blocks doubles. */
  private leaderClient: WorkspaceClient | null = null;
  private creating: Promise<WorkspaceClient> | null = null;

  constructor(config: InitializationConfig) {
    this.config = config;
  }

  /**
   * Wait for leader election to settle.
   * Returns when we know if we're leader or follower.
   */
  async waitForLeaderElection(): Promise<void> {
    debugLog('WebSocketInit', `waitForLeaderElection: checking initial state isLeader=${instanceManager.isLeader}, leaderId=${instanceManager.leaderId}`);
    if (instanceManager.isLeader || instanceManager.leaderId) {
      debugLog('WebSocketInit', `waitForLeaderElection: already decided, returning immediately`);
      return;
    }

    const ELECTION_TIMEOUT_MS: 3000 = INTERVAL.LEADER_ELECTION_MS;
    debugLog('WebSocketInit', `waitForLeaderElection: waiting up to ${ELECTION_TIMEOUT_MS}ms for leader election`);

    return new Promise<void>((resolve) => {
      let resolved = false;

      const handler = ({ isLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
        if (!resolved) {
          resolved = true;
          eventEmitter.off('instance:leader-changed', handler);
          debugLog('WebSocketInit', `waitForLeaderElection: leader-changed event received: isLeader=${isLeader}, leaderId=${leaderId}`);
          resolve();
        }
      };

      eventEmitter.on('instance:leader-changed', handler);

      if (instanceManager.isLeader || instanceManager.leaderId) {
        if (!resolved) {
          resolved = true;
          eventEmitter.off('instance:leader-changed', handler);
          debugLog('WebSocketInit', `waitForLeaderElection: decided during setup, isLeader=${instanceManager.isLeader}, leaderId=${instanceManager.leaderId}`);
          resolve();
        }
      }

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          eventEmitter.off('instance:leader-changed', handler);
          debugLog('WebSocketInit', `waitForLeaderElection: TIMEOUT after ${ELECTION_TIMEOUT_MS}ms - no leader detected`);
          if (!instanceManager.isLeader && !instanceManager.leaderId) {
            debugLog('WebSocketInit', `waitForLeaderElection: Will let InstanceChannel handle election`);
          }
          resolve();
        }
      }, ELECTION_TIMEOUT_MS);
    });
  }

  /**
   * Watch for promotion and demotion. Idempotent — safe from either init path.
   *
   * This lived inside `initializeAsFollower`, so a tab that BOOTED as leader
   * never registered it, and `closeLeaderClient` has no other caller: on
   * demotion it kept a live socket that dropped every frame it received.
   */
  registerLeadershipListener(): void {
    if (this.leadershipListenerRegistered) return;
    this.leadershipListenerRegistered = true;

    installLeadershipListener({
      createWebSocketAsLeader: () => this.createWebSocketAsLeader(),
      closeLeaderClient: () => this.closeLeaderClient(),
    });
  }

  /** Initialize as follower (no WebSocket). */
  initializeAsFollower(): void {
    debugLog('WebSocketInit', 'Follower tab: Skipping WebSocket creation, will proxy through leader');

    eventEmitter.emit('on-ws-connection-success');
    debugLog('WebSocketInit', 'Follower initialization complete');
  }

  /** Create WebSocket connection when this tab is the leader. */
  async createWebSocketAsLeader(): Promise<WorkspaceClient> {
    // Idempotent: a demoted-then-promoted tab would otherwise open a second
    // socket while the first is still live. closeLeaderClient waits on it too.
    if (this.leaderClient) return this.leaderClient;
    if (this.creating) return this.creating;
    this.creating = this.doCreateWebSocketAsLeader().finally(() => {
      this.creating = null;
    });
    return this.creating;
  }

  /**
   * Tear down the socket this tab owned while it was leader. Waits for an
   * in-flight build: leaderClient is null while the build awaits, so a demotion
   * mid-build closed nothing and left a live, deaf socket owned by a follower.
   */
  async closeLeaderClient(): Promise<void> {
    if (this.creating) await this.creating.catch(() => undefined);
    const client = this.leaderClient;
    if (!client) return;
    this.leaderClient = null;
    await closeLeaderSocket(client);
    this.config.onClientReset();
    window[GLOBAL_INIT_KEY] = undefined;
  }

  private async doCreateWebSocketAsLeader(): Promise<WorkspaceClient> {
    const clientConfig: WorkspaceClientConfig = {
      websocketUrl: this.config.websocketUrl,
      messageHandler: (rawMessage: InternalServiceResponse) => {
        const message: InternalServiceResponse = rawMessage;
        debugLog('WebSocketInit', 'Message received from WASM client', message);

        if (instanceManager.isLeader) {
          instanceInboundRouter.routeMessage(message);
        } else {
          // Drop, do not emit: emitting bypasses the router's CID filtering,
          // so another session's traffic lands in this tab's bus.
          // closeLeaderClient makes this a fail-safe, not a delivery path.
          debugLog('WebSocketInit', 'Dropping message received after demotion');
        }

        if (broadcastChannelService.getIsLeader()) {
          const messageType = Object.keys(message)[0] as ResponseType | undefined;
          // CID-routed notifications already flow through the inbound router's
          // CID path; broadcasting them again here would cause duplicate
          // delivery on the receiving tab. Single source of truth in
          // routing-rules.ts.
          if (!messageType || !CID_ROUTED_NOTIFICATIONS.has(messageType)) {
            broadcastChannelService.broadcastWorkspaceResponse(message);
          } else {
            debugLog('WebSocketInit', `Skipping legacy broadcast for CID-routed ${messageType} (handled by instanceInboundRouter)`);
          }
        }

        if (this.config.messageHandler) {
          this.config.messageHandler(message);
        }
      },
      errorHandler: this.config.errorHandler,
    };

    try {
      debugLog('WebSocketInit', 'Creating WorkspaceClient with config', clientConfig);
      const client: WorkspaceClient = new WorkspaceClient(clientConfig);
      await client.init();
      this.leaderClient = client;

      eventEmitter.emit('on-ws-connection-success');

      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].client = client;
      }

      leaderOutboundHandler.setWebSocketSendFunction(async (message: unknown) => {
        await client.sendDirectToInternalService(message as InternalServiceRequest);
      });
      debugLog('WebSocketInit', 'Registered send function with leader outbound handler');

      this.setupDisconnectionHandler(client);
      this.setupSessionReleaseHandler();

      this.config.onClientCreated(client);

      debugLog('WebSocketInit', 'WASM client initialization completed successfully');
      return client;
    } catch (error) {
      errorLog('Error initializing WorkspaceClient:', error);

      const errorMessage: string = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
      eventEmitter.emit('connection-failure', { error: errorMessage });

      throw error;
    }
  }

  private setupDisconnectionHandler(client: WorkspaceClient): void {
    setupDisconnection(client, {
      clearClient: () => {
        this.leaderClient = null;
        window[GLOBAL_INIT_KEY] = undefined;
      },
      onClientReset: () => this.config.onClientReset(),
      releaseSession: (cid: bigint) => this.config.releaseSession(cid),
    });
  }


  private setupSessionReleaseHandler(): void {
    setupSessionRelease({ releaseSession: (cid: bigint) => this.config.releaseSession(cid) });
  }
}
