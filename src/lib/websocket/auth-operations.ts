/**
 * Authentication Operations
 *
 * Handles connect and register operations via the internal service.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { debugLog } from '../debug-config';
import {
  type SessionSecuritySettings,
  getDefaultSecuritySettings
} from '../security-utils';
import { resolveServerAddress } from '../address-resolver';
import { instanceManager } from '../multi-instance';
import { stringToBytes } from '../utils/encoding-utils';

export interface AuthConfig {
  init: () => Promise<void>;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
  claimSession: (cid: bigint, onlyIfOrphaned: boolean) => Promise<unknown>;
  disconnect: (cid: bigint) => Promise<void>;
}

export class AuthOperations {
  private readonly config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async connect(
    requestId: string,
    username: string,
    password: string,
    sessionSecuritySettings?: SessionSecuritySettings
  ): Promise<void> {
    await this.config.init();

    // Server address is NOT needed for login - the Citadel protocol stores it from registration
    debugLog('AuthOperations', `[Connect] Connecting user: ${username}`);

    // Check if session already exists
    try {
      const { connectionManager } = await import('../connection');
      const activeSessions = await connectionManager.getActiveSessions();
      const existingSession = activeSessions.find(s => s.username === username);

      if (existingSession) {
        debugLog('AuthOperations', `[Connect] Found existing session CID ${existingSession.cid}`);

        // Check if session is orphaned
        const { connectionManager: cm } = await import('../connection');
        const storedSession = cm.getStoredSessions().sessions.find(s => s.username === username);
        const isOrphaned = !storedSession?.cid || storedSession.cid !== existingSession.cid;

        if (isOrphaned) {
          debugLog('AuthOperations', `[Connect] Session is orphaned - claiming CID ${existingSession.cid}`);
          await this.config.claimSession(existingSession.cid, false);
          return;
        } else {
          debugLog('AuthOperations', '[Connect] Session exists but not orphaned - disconnecting first');
          await this.config.disconnect(existingSession.cid);
        }
      }
    } catch (error) {
      debugLog('AuthOperations', '[Connect] Session check failed, proceeding with Connect:', error);
    }

    // Proceed with Connect request
    debugLog('AuthOperations', `[Connect] Proceeding with new connection for ${username}`);

    // Use provided settings or defaults (snake_case from SessionSecuritySettings)
    const settings = sessionSecuritySettings ?? getDefaultSecuritySettings();

    const connectOptions = {
      request_id: requestId,
      username,
      password: stringToBytes(password),
      connect_mode: { Standard: { force_login: true } },
      udp_mode: "Disabled",
      keep_alive_timeout: null,
      session_security_settings: {
        security_level: settings.security_level,
        secrecy_mode: settings.secrecy_mode,
        header_obfuscator_settings: settings.header_obfuscator_settings,
        crypto_params: settings.crypto_params,
      },
    };

    const connectRequest = { Connect: connectOptions };

    debugLog('AuthOperations', `[Connect] Sending Connect request with request_id: ${requestId}`);
    debugLog('AuthOperations', `[Connect] isLeader: ${instanceManager.isLeader}`);

    try {
      await this.config.sendRequest(connectRequest, requestId);
      debugLog('AuthOperations', `[Connect] Connect request sent successfully for ${username}`);
    } catch (sendError) {
      debugLog('AuthOperations', '[Connect] FAILED to send Connect request:', sendError);
      throw sendError;
    }
  }

  async register(
    requestId: string,
    username: string,
    password: string,
    fullName: string,
    serverAddr: string,
    serverPassword?: string,
    sessionSecuritySettings?: SessionSecuritySettings
  ): Promise<void> {
    await this.config.init();

    // Resolve hostname to IP if needed (DNS resolution)
    const resolvedAddr = await resolveServerAddress(serverAddr);
    debugLog('AuthOperations', `[Register] Resolved address: ${serverAddr} -> ${resolvedAddr}`);

    // Use provided settings or defaults (snake_case from SessionSecuritySettings)
    const settings = sessionSecuritySettings ?? getDefaultSecuritySettings();

    const registerOptions = {
      request_id: requestId,
      server_addr: resolvedAddr,
      full_name: fullName,
      username,
      proposed_password: stringToBytes(password),
      connect_after_register: true,
      session_security_settings: {
        security_level: settings.security_level,
        secrecy_mode: settings.secrecy_mode,
        header_obfuscator_settings: settings.header_obfuscator_settings,
        crypto_params: settings.crypto_params,
      },
      // Note: server_password is the Citadel protocol PreSharedKey for C2S connection,
      // NOT the workspace master password. The workspace master password is validated
      // at the workspace protocol layer (CreateWorkspace/JoinWorkspace), not here.
      server_password: serverPassword
        ? { passwords: [stringToBytes(serverPassword)] }
        : null
    };

    debugLog('AuthOperations', 'Sending register options to WASM client', registerOptions);

    const registerRequest = { Register: registerOptions };

    debugLog('AuthOperations', `[Register] isLeader: ${instanceManager.isLeader}`);

    await this.config.sendRequest(registerRequest, requestId);
  }
}
