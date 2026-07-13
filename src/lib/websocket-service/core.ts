/**
 * WebSocket Service - Core Class
 *
 * Thin facade that delegates to extracted operation modules.
 */

import type { WorkspaceClient } from 'citadel-workspace-client-ts';
// Namespace import to break circular dependency:
// THIS FILE → connection/index.ts → io.ts → io-websocket.ts → websocket-service (cycle)
// Property access on the namespace object is a live binding, deferred to call time.
import * as connModule from '../connection';
import type { SessionSecuritySettings } from '../security-utils';
import type { WebSocketServiceConfig } from './types';
import { resolveWebsocketUrl } from './resolve-url';
import { createServiceModules, type ServiceModules } from './module-init';
import { initService, waitForInit as waitForInitFn, resetService } from './initialization';
import { sendRequest as sendRequestFn } from './send-request';

export class WebSocketServiceCore {
  client: WorkspaceClient | null = null;
  isInitialized = false;
  initializationPromise: Promise<void> | null = null;

  private readonly modules: ServiceModules;

  // Exposed for initialization.ts
  get initOps() { return this.modules.initOps; }

  constructor(config: WebSocketServiceConfig = {}) {
    // Defaults to a same-origin `/ws` path rather than a baked-in `ws://localhost:12345`. The
    // production CSP is `connect-src 'self'`, which blocks an off-origin socket, and a build-time
    // URL cannot be distributed as a single image. See resolve-url.ts.
    const wsUrl = resolveWebsocketUrl(
      config.websocketUrl,
      import.meta.env.VITE_WS_URL,
      window.location,
    );

    this.modules = createServiceModules(
      wsUrl,
      config.messageHandler,
      config.errorHandler,
      {
        init: () => this.init(),
        sendRequest: (req, reqId) => this._sendRequest(req, reqId),
        sendMessage: (msg) => this.sendMessage(msg),
        claimSession: (cid, onlyIfOrphaned) => this.claimSession(cid, onlyIfOrphaned),
        disconnect: (cid) => this.disconnect(cid),
        releaseSession: (cid) => this.releaseSession(cid),
        getClient: () => this.client,
        onClientCreated: (client) => { this.client = client; this.isInitialized = true; },
        onClientReset: () => { this.client = null; this.isInitialized = false; this.initializationPromise = null; },
      }
    );
  }

  // ============== Initialization ==============

  async init(): Promise<void> { return initService(this); }
  async waitForInit(): Promise<void> { return waitForInitFn(this); }
  reset(): void { resetService(this); }

  // ============== Core Send ==============

  _sendRequest(request: Record<string, unknown>, requestId?: string): Promise<void> {
    return sendRequestFn(this, request, requestId);
  }

  async sendMessage(message: Record<string, unknown>): Promise<void> {
    await this._sendRequest(message);
  }

  async sendRequest(request: Record<string, unknown>): Promise<void> {
    await this.init();
    return this._sendRequest(request);
  }

  // ============== Auth ==============

  async connect(
    requestId: string, username: string, password: string,
    sessionSecuritySettings?: SessionSecuritySettings
  ): Promise<void> {
    return this.modules.authOps.connect(requestId, username, password, sessionSecuritySettings);
  }

  async register(
    requestId: string, username: string, password: string,
    fullName: string, serverAddr: string, serverPassword?: string,
    sessionSecuritySettings?: SessionSecuritySettings
  ): Promise<void> {
    return this.modules.authOps.register(requestId, username, password, fullName, serverAddr, serverPassword, sessionSecuritySettings);
  }

  // ============== Workspace ==============

  async sendWorkspaceRequest(cid: bigint, request: unknown): Promise<void> {
    return this.modules.workspaceOps.sendWorkspaceRequest(cid, request);
  }

  // ============== P2P ==============

  async sendP2PMessage(cid: bigint, targetCid: bigint, message: string): Promise<void> {
    return this.modules.p2pOps.sendP2PMessage(cid, targetCid, message);
  }

  /**
   * Send a raw `Uint8Array` over the P2P channel without `stringToBytes`-
   * style UTF-8 reinterpretation. Required by callers that already encode
   * payloads as bytes (CBOR via `serializeP2PCommand`) — the string-taking
   * `sendP2PMessage` above would otherwise round-trip the bytes through
   * `stringToBytes` which assumes UTF-8 and corrupts binary payloads.
   */
  async sendP2PMessageBytes(cid: bigint, targetCid: bigint, message: Uint8Array): Promise<void> {
    return this.modules.p2pOps.sendP2PMessageBytes(cid, targetCid, message);
  }

  async openP2PConnection(cid: bigint, targetCid: bigint): Promise<void> {
    return this.modules.p2pOps.openP2PConnection(cid, targetCid);
  }

  async acceptPeerConnect(cid: bigint, peerCid: bigint, notification: Record<string, unknown> | null): Promise<void> {
    return this.modules.p2pOps.acceptPeerConnect(cid, peerCid, notification);
  }

  async disconnectP2P(localCid: bigint, peerCid: bigint): Promise<void> {
    return this.modules.p2pOps.disconnectP2P(localCid, peerCid);
  }

  // ============== Messenger ==============

  async openMessengerFor(cid: bigint): Promise<void> {
    return this.modules.messengerOps.openMessengerFor(cid);
  }

  async ensureMessengerOpen(cid: bigint): Promise<boolean> {
    return this.modules.messengerOps.ensureMessengerOpen(cid);
  }

  async sendP2PMessageReliable(
    localCid: bigint, peerCid: bigint, message: Uint8Array,
    securityLevel?: 'Standard' | 'Reinforced' | 'High' | 'Extreme'
  ): Promise<void> {
    return this.modules.messengerOps.sendP2PMessageReliable(localCid, peerCid, message, securityLevel);
  }

  // ============== Disconnect ==============

  async disconnect(cid: bigint): Promise<void> {
    return this.modules.disconnectOps.disconnect(cid);
  }

  async deregister(cid: bigint): Promise<void> {
    return this.modules.disconnectOps.deregister(cid);
  }

  async disconnectAndClose(): Promise<void> {
    // Mirrors the disconnection handler in `websocket/initialization.ts`:
    // stop the WASM client's message-processing loop, close the
    // underlying WebSocket, then reset our service state. The previous
    // implementation only nulled the client reference via `resetService`
    // - leaving the WASM-side message loop, the WebSocket, and any P2P
    // polling timers running, which would orphan resources and leak
    // memory if a future caller invoked this method on an active
    // connection (no current callers, but the method's name commits to
    // a full teardown).
    const client = this.client;
    if (client) {
      client.stopMessageProcessing();
      try {
        await client.close();
      } catch {
        // Ignore close errors; we proceed to reset local state regardless.
      }
    }
    resetService(this);
  }

  // ============== Session Management ==============

  async setOrphanMode(enabled: boolean): Promise<unknown> {
    return this.modules.sessionMgmt.setOrphanMode(enabled);
  }

  setOrphanModeNonBlocking(enabled: boolean): void {
    this.modules.sessionMgmt.setOrphanModeNonBlocking(enabled);
  }

  async claimSession(sessionCid: string | bigint, onlyIfOrphaned?: boolean): Promise<unknown> {
    return this.modules.sessionMgmt.claimSession(sessionCid, onlyIfOrphaned ?? false);
  }

  async disconnectOrphan(sessionCid?: string | bigint | null): Promise<unknown> {
    return this.modules.sessionMgmt.disconnectOrphan(sessionCid);
  }

  releaseSession(sessionCid: bigint): void {
    this.modules.sessionMgmt.releaseSession(sessionCid);
  }

  // ============== State / Getters ==============

  isConnected(): boolean { return this.isInitialized && this.client !== null; }
  getClient(): WorkspaceClient | null { return this.client; }

  async getWasmModule(): Promise<WorkspaceClient | null> {
    await this.init();
    return this.client ?? null;
  }

  async getWasmClient(): Promise<WorkspaceClient | null> {
    await this.init();
    return this.client;
  }

  async getConnectionInfo(): Promise<{ cid: bigint } | null> {
    return connModule.connectionManager.getConnectionInfo();
  }

  // ============== LocalDB ==============

  async sendLocalDBGet(cid: bigint, key: string): Promise<{ value: number[] } | null> {
    return this.modules.localDB.get(cid, key);
  }

  async sendLocalDBSet(cid: bigint, key: string, value: number[]): Promise<void> {
    return this.modules.localDB.set(cid, key, value);
  }

  async sendLocalDBDelete(cid: bigint, key: string): Promise<void> {
    return this.modules.localDB.delete(cid, key);
  }

  async sendLocalDBListKeys(cid: bigint, prefix?: string): Promise<string[]> {
    return this.modules.localDB.listKeys(cid, prefix);
  }

  // ============== File Picker ==============

  async pickFile(
    cid: bigint, title?: string, allowedExtensions?: string[]
  ): Promise<{ file_path: string; file_name: string; file_size: bigint }> {
    return this.modules.filePicker.pickFile(cid, title, allowedExtensions);
  }
}
