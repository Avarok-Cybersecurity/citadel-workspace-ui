import { WorkspaceClient, type WorkspaceClientConfig } from 'citadel-workspace-client-ts';
import { eventEmitter } from './event-emitter';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { broadcastChannelService } from './broadcast-channel-service';
import { connectionManager } from './connection-manager';
import { debugLog, errorLog } from './debug-config';

export interface WebSocketServiceConfig {
  websocketUrl?: string;
  messageHandler?: (message: any) => void;
  errorHandler?: (error: Error) => void;
}

// Helper function to convert string to byte array
function stringToByteArray(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

// Global state to prevent multiple WASM client initializations
const GLOBAL_INIT_KEY = '__citadel_wasm_client_init__';
declare global {
  interface Window {
    [GLOBAL_INIT_KEY]?: {
      promise: Promise<void>;
      initialized: boolean;
    };
  }
}

class WebSocketService {
  private client: WorkspaceClient | null = null;
  private config: WebSocketServiceConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: WebSocketServiceConfig = {}) {
    this.config = {
      websocketUrl: config.websocketUrl || 'ws://localhost:12345',
      messageHandler: config.messageHandler,
      errorHandler: config.errorHandler,
    };
  }

  async init(): Promise<void> {
    // Check global state first
    if (window[GLOBAL_INIT_KEY]?.initialized) {
      debugLog('websocket', 'Service already initialized (global check)');
      this.isInitialized = true;
      return;
    }

    if (this.isInitialized) {
      debugLog('websocket', 'Service already initialized');
      return;
    }

    // Check global initialization promise
    if (window[GLOBAL_INIT_KEY]?.promise) {
      debugLog('websocket', 'Service initialization already in progress globally, waiting...');
      try {
        await window[GLOBAL_INIT_KEY].promise;
        this.isInitialized = true;
        return;
      } catch (error) {
        errorLog('Global initialization failed:', error);
        // Clear the global state to allow retry
        window[GLOBAL_INIT_KEY] = undefined;
        
        // Emit connection-failure event
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
        eventEmitter.emit('connection-failure', { error: errorMessage });
        
        throw error;
      }
    }

    // Prevent concurrent initialization attempts
    if (this.initializationPromise) {
      debugLog('websocket', 'Service initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    // Create and store the promise globally
    this.initializationPromise = this._doInit();
    window[GLOBAL_INIT_KEY] = {
      promise: this.initializationPromise,
      initialized: false
    };

    try {
      await this.initializationPromise;
      // Mark as initialized globally
      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].initialized = true;
      }
    } catch (error) {
      // Clear global state on error
      window[GLOBAL_INIT_KEY] = undefined;
      
      // Emit connection-failure event
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
      eventEmitter.emit('connection-failure', { error: errorMessage });
      
      throw error;
    } finally {
      // Keep the promise to prevent re-initialization
      // this.initializationPromise = null;
    }
  }

  private async _doInit(): Promise<void> {
    debugLog('websocket', 'WASM client initialization starting...');
    
    // Set up WASM debug bridge before initializing client
    const { setupWasmDebugBridge } = await import('./wasm-debug-bridge');
    setupWasmDebugBridge();
    
    const clientConfig: WorkspaceClientConfig = {
      websocketUrl: this.config.websocketUrl!,
      messageHandler: (message: InternalServiceResponse) => {
        debugLog('websocket', 'Message received from WASM client', message);
        
        // Broadcast the message to other tabs if we're the leader
        if (broadcastChannelService.getIsLeader()) {
          broadcastChannelService.broadcastWorkspaceResponse(message);
        }
        
        // Forward the response to the handler
        if (this.config.messageHandler) {
          this.config.messageHandler(message);
        }
        
        // Also emit events for compatibility
        eventEmitter.emit('websocket-message', message);
      },
      errorHandler: this.config.errorHandler,
    };

    try {
      debugLog('websocket', 'Creating WorkspaceClient with config', clientConfig);
      this.client = new WorkspaceClient(clientConfig);
      await this.client.init();
      this.isInitialized = true;
      debugLog('websocket', 'WASM client initialization completed successfully');
    } catch (error) {
      errorLog('Error initializing WorkspaceClient:', error);
      this.client = null;
      this.isInitialized = false;
      
      // Emit connection-failure event for UI to handle
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
      eventEmitter.emit('connection-failure', { error: errorMessage });
      
      throw error;
    }
  }

  async connect(requestId: string, username: string, password: string, serverAddr: string = '127.0.0.1:12349'): Promise<void> {
    await this.init(); // ensure initialized

    // Create proper connect options for WorkspaceClient
    // TODO: use @avarok/citadel-protocol-types to inform the combinations below for:
    // UdpMode, ConnectMode, SessionSecuritySettings (SecurityLevel, Secrecy Mode, Crypto Params (Encryption algorithm, kem algorithm, sig algorithm)), header obfuscation settings
    // These type all should exist inside that package ready to be slotted inside the UI components for anywhere they're required, not just connect.
    const connectOptions = {
      request_id: requestId,
      server_addr: serverAddr,
      username,
      password: stringToByteArray(password),
      connect_mode: { Standard: { force_login: true } } as any,
      udp_mode: "Disabled" as any,
      keep_alive_timeout: null,
      session_security_settings: {
        security_level: "Standard",
        secrecy_mode: "BestEffort",
        crypto_params: {
          encryption_algorithm: "AES_GCM_256",
          kem_algorithm: "Kyber",
          sig_algorithm: "None"
        },
        header_obfuscator_settings: "Disabled"
      } as any,
      server_password: null as any
    };

    // Send connect request directly to avoid the waitForResponse handler replacement issue
    const connectRequest = {
      Connect: connectOptions
    };
    
    // Send directly to internal service without using the problematic waitForResponse pattern
    await this.client.sendDirectToInternalService(connectRequest);
  }

  async register(requestId: string, username: string, password: string, fullName: string, sessionSecuritySettings?: any): Promise<void> {
    await this.init(); // ensure initialized

    // Use provided session security settings or defaults
    const securitySettings = sessionSecuritySettings || {
      securityLevel: "Standard",
      secrecyMode: "BestEffort",
      encryptionAlgorithm: "AES_GCM_256",
      kemAlgorithm: "Kyber",
      sigAlgorithm: "None",
      headerObfuscatorSettings: "Disabled"
    };

    // Create proper register options for WorkspaceClient
    const registerOptions = {
      request_id: requestId,
      server_addr: '127.0.0.1:12349',
      full_name: fullName,
      username,
      proposed_password: stringToByteArray(password),
      connect_after_register: true, // Establish connection immediately after registration
      session_security_settings: {
        security_level: securitySettings.securityLevel,
        secrecy_mode: securitySettings.secrecyMode,
        crypto_params: {
          encryption_algorithm: securitySettings.encryptionAlgorithm,
          kem_algorithm: securitySettings.kemAlgorithm,
          sig_algorithm: securitySettings.sigAlgorithm
        },
        header_obfuscator_settings: "Disabled"
      } as any,
      server_password: null as any
    };

    debugLog('websocket', 'Sending register options to WASM client', registerOptions);
    
    // Send register request directly to avoid the waitForResponse handler replacement issue
    const registerRequest = {
      Register: registerOptions
    };
    
    // Send directly to internal service without using the problematic waitForResponse pattern
    await this.client.sendDirectToInternalService(registerRequest);
  }


  async sendWorkspaceRequest(cid: string, request: any): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to send workspace request');
    }

    // Use WorkspaceClient's sendWorkspaceRequest method
    // Convert string CID to BigInt for the WASM client
    const cidBigInt = BigInt(cid);
    await this.client.sendWorkspaceRequest(cidBigInt, request);
  }

  async sendP2PMessage(cid: string, targetCid: string, message: string): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to send P2P message');
    }

    // For now, send raw message directly - proper triple-protocol nesting will be implemented in Phase 5
    await this.client.sendP2PMessageDirect(targetCid, message);
  }

  async openP2PConnection(cid: string, targetCid: string): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to open P2P connection');
    }

    // Use the WorkspaceClient's P2P method
    await this.client.openP2PConnection(targetCid);
  }

  async disconnect(cid?: string): Promise<void> {
    await this.init(); // ensure initialized

    if (cid) {
      try {
        // Send a Disconnect request for specific CID
        // Disconnect is already a top-level request, no need to wrap in Request
        const request = {
          Disconnect: {
            request_id: crypto.randomUUID(),
            cid: cid // Send CID as string - Rust side will parse to u64
          }
        };
        debugLog('websocket', 'Sending Disconnect request', request);
        await this.client.sendDirectToInternalService(request);
      } catch (error) {
        errorLog('Error disconnecting:', error);
        throw error; // Re-throw so caller knows disconnect failed
      }
    }
  }

  async disconnectAndClose(): Promise<void> {
    // This completely closes the WebSocket connection
    this.client = null;
    this.isInitialized = false;
  }

  isConnected(): boolean {
    return this.isInitialized && this.client !== null;
  }


  getClient(): WorkspaceClient | null {
    return this.client;
  }

  /**
   * Convert BigInt values to strings recursively for JSON serialization
   */
  private convertBigIntToString(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertBigIntToString(item));
    }
    
    if (typeof obj === 'object') {
      const converted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        converted[key] = this.convertBigIntToString(value);
      }
      return converted;
    }
    
    return obj;
  }

  /**
   * Send a direct message to the internal service
   */
  async sendMessage(message: any): Promise<void> {
    await this.init(); // ensure initialized
    
    // First convert string CIDs to BigInt where needed, then convert back for serialization
    const processedMessage = this.convertCidFieldsToBigInt(message);
    
    // Convert BigInt values to strings for JSON serialization
    const jsonSerializableMessage = this.convertBigIntToString(processedMessage);
    
    debugLog('websocket', 'Sending message to internal service', jsonSerializableMessage);
    await this.client.sendDirectToInternalService(jsonSerializableMessage);
  }

  /**
   * Enable orphan mode for the current connection
   * When enabled, sessions will persist even when the TCP connection drops
   */
  async setOrphanMode(enabled: boolean): Promise<any> {
    await this.init(); // ensure initialized
    
    const requestId = crypto.randomUUID();
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          SetConnectionOrphan: {
            allow_orphan_sessions: enabled
          }
        }
      }
    };
    
    debugLog('websocket', 'Sending SetConnectionOrphan request', request);
    
    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('SetConnectionOrphan request timed out'));
      }, 10000);
      
      const handler = (message: any) => {
        const response = message.Response || message;
        
        if ('ConnectionManagementSuccess' in response && response.ConnectionManagementSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: response.ConnectionManagementSuccess.message
          });
        } else if ('ConnectionManagementFailure' in response && response.ConnectionManagementFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.ConnectionManagementFailure.error || 'Failed to set orphan mode'));
        }
      };
      
      eventEmitter.on('websocket-message', handler);
      
      // Send the request - ConnectionManagement is already a top-level request, no need to wrap in Request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Claim an existing session (take over from another connection)
   * @param sessionCid The CID of the session to claim
   * @param onlyIfOrphaned If true, only claim if the session is orphaned
   */
  async claimSession(sessionCid: string | bigint, onlyIfOrphaned: boolean = false): Promise<any> {
    await this.init(); // ensure initialized
    
    const requestId = crypto.randomUUID();
    // Convert to string for logging
    const sessionCidString = sessionCid.toString();
    
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          ClaimSession: {
            session_cid: sessionCidString, // Send as string, the server should handle conversion
            only_if_orphaned: onlyIfOrphaned
          }
        }
      }
    };
    
    debugLog('websocket', 'Sending ClaimSession request with CID: ' + sessionCidString);
    
    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('ClaimSession request timed out'));
      }, 10000);
      
      const handler = (message: any) => {
        const response = message.Response || message;
        
        if ('ConnectionManagementSuccess' in response && response.ConnectionManagementSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: response.ConnectionManagementSuccess.message,
            cid: response.ConnectionManagementSuccess.cid
          });
        } else if ('ConnectionManagementFailure' in response && response.ConnectionManagementFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.ConnectionManagementFailure.error || 'Failed to claim session'));
        }
      };
      
      eventEmitter.on('websocket-message', handler);
      
      // Send the request - ConnectionManagement is already a top-level request, no need to wrap in Request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Disconnect orphan sessions
   * @param sessionCid Optional - if provided, disconnect specific session. If null, disconnect all orphan sessions.
   */
  async disconnectOrphan(sessionCid?: string | bigint | null): Promise<any> {
    await this.init(); // ensure initialized
    
    const requestId = crypto.randomUUID();
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          DisconnectOrphan: {
            session_cid: sessionCid ? BigInt(sessionCid) : null
          }
        }
      }
    };
    
    debugLog('websocket', 'Sending DisconnectOrphan request', request);
    
    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('DisconnectOrphan request timed out'));
      }, 10000);
      
      const handler = (message: any) => {
        const response = message.Response || message;
        
        if ('ConnectionManagementSuccess' in response && response.ConnectionManagementSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: response.ConnectionManagementSuccess.message
          });
        } else if ('ConnectionManagementFailure' in response && response.ConnectionManagementFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.ConnectionManagementFailure.error || 'Failed to disconnect orphan'));
        }
      };
      
      eventEmitter.on('websocket-message', handler);
      
      // Send the request - ConnectionManagement is already a top-level request, no need to wrap in Request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Get the WASM module instance for direct P2P operations
   */
  async getWasmModule(): Promise<any> {
    await this.init(); // ensure initialized
    
    // The WASM module should be available on the client instance
    // This assumes the WorkspaceClient extends InternalServiceWasmClient which has access to the WASM module
    // @human-review Need to check how WorkspaceClient exposes WASM module
    return (this.client as any)?._wasmModule || null;
  }

  /**
   * Get the WASM client instance for direct access
   */
  async getWasmClient(): Promise<WorkspaceClient | null> {
    await this.init();
    return this.client;
  }

  /**
   * Send a raw request using the InternalServiceRequest format
   */
  async sendRequest(request: any): Promise<any> {
    await this.init();
    return this.client.sendDirectToInternalService(request);
  }

  /**
   * Get current connection info including CID
   */
  async getConnectionInfo(): Promise<{ cid: string } | null> {
    return connectionManager.getConnectionInfo();
  }

  /**
   * Convert CID fields from strings to BigInt where needed by the WASM client
   */
  private convertCidFieldsToBigInt(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertCidFieldsToBigInt(item));
    }
    
    if (typeof obj === 'object') {
      const converted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Convert CID-related fields to BigInt
        if ((key === 'cid' || key === 'peer_cid' || key === 'session_cid') && 
            typeof value === 'string' && value !== '') {
          converted[key] = BigInt(value);
        } else {
          converted[key] = this.convertCidFieldsToBigInt(value);
        }
      }
      return converted;
    }
    
    return obj;
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();