/**
 * WebSocket Service - Module Initialization
 *
 * Creates and configures all operation module instances
 * for the WebSocketServiceCore class.
 */

import type { WorkspaceClient } from 'citadel-workspace-client-ts';
import { instanceManager } from '../multi-instance';
import {
  LocalDBOperations,
  SessionManagement,
  FilePicker,
  P2POperations,
  MessengerOperations,
  DisconnectOperations,
  AuthOperations,
  WebSocketInitialization,
  WorkspaceOperations,
} from '../websocket';

export interface ServiceModules {
  localDB: LocalDBOperations;
  sessionMgmt: SessionManagement;
  filePicker: FilePicker;
  p2pOps: P2POperations;
  messengerOps: MessengerOperations;
  disconnectOps: DisconnectOperations;
  authOps: AuthOperations;
  initOps: WebSocketInitialization;
  workspaceOps: WorkspaceOperations;
}

export interface ServiceCallbacks {
  init: () => Promise<void>;
  sendRequest: (req: Record<string, unknown>, reqId?: string) => Promise<void>;
  sendMessage: (msg: Record<string, unknown>) => Promise<void>;
  claimSession: (cid: bigint, onlyIfOrphaned: boolean) => Promise<unknown>;
  disconnect: (cid: bigint) => Promise<void>;
  releaseSession: (cid: bigint) => void;
  getClient: () => WorkspaceClient | null;
  onClientCreated: (client: WorkspaceClient) => void;
  onClientReset: () => void;
}

export function createServiceModules(
  websocketUrl: string,
  messageHandler: ((message: unknown) => void) | undefined,
  errorHandler: ((error: Error) => void) | undefined,
  callbacks: ServiceCallbacks
): ServiceModules {
  const moduleConfig = {
    init: callbacks.init,
    sendRequest: (req: unknown, reqId?: string) => callbacks.sendRequest(req as Record<string, unknown>, reqId),
    getClient: callbacks.getClient,
  };

  const localDB: LocalDBOperations = new LocalDBOperations(moduleConfig);
  const sessionMgmt: SessionManagement = new SessionManagement(moduleConfig);
  const filePicker: FilePicker = new FilePicker(moduleConfig);

  const p2pOps: P2POperations = new P2POperations({
    init: callbacks.init,
    sendMessage: (msg: unknown) => callbacks.sendMessage(msg as Record<string, unknown>),
    isLeader: () => instanceManager.isLeader,
  });

  const messengerOps: MessengerOperations = new MessengerOperations({
    init: callbacks.init,
    getClient: callbacks.getClient,
  });

  const disconnectOps: DisconnectOperations = new DisconnectOperations({
    init: callbacks.init,
    sendRequest: (req: unknown, reqId?: string) => callbacks.sendRequest(req as Record<string, unknown>, reqId),
  });

  const authOps: AuthOperations = new AuthOperations({
    init: callbacks.init,
    sendRequest: (req: unknown, reqId?: string) => callbacks.sendRequest(req as Record<string, unknown>, reqId),
    claimSession: callbacks.claimSession,
    disconnect: callbacks.disconnect,
  });

  const initOps: WebSocketInitialization = new WebSocketInitialization({
    websocketUrl,
    messageHandler,
    errorHandler,
    onClientCreated: callbacks.onClientCreated,
    onClientReset: callbacks.onClientReset,
    releaseSession: callbacks.releaseSession,
  });

  const workspaceOps: WorkspaceOperations = new WorkspaceOperations({
    init: callbacks.init,
    getClient: callbacks.getClient,
  });

  return {
    localDB,
    sessionMgmt,
    filePicker,
    p2pOps,
    messengerOps,
    disconnectOps,
    authOps,
    initOps,
    workspaceOps,
  };
}
