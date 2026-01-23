/**
 * Authentication Operations
 *
 * Handles connect and register operations via the internal service.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { debugLog } from '../debug-config';
import { normalizeHeaderObfuscatorSettings } from '../security-utils';
import { resolveServerAddress } from '../address-resolver';
import { instanceManager } from '../multi-instance';

export interface AuthConfig {
  init: () => Promise<void>;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
  claimSession: (cid: bigint, onlyIfOrphaned: boolean) => Promise<unknown>;
  disconnect: (cid: bigint) => Promise<void>;
}

// Helper function to convert string to byte array
function stringToByteArray(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
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
    serverAddr: string,
    serverPassword?: string,
    sessionSecuritySettings?: Record<string, unknown>
  ): Promise<void> {
    await this.config.init();

    // Resolve hostname to IP if needed (DNS resolution)
    const resolvedAddr = await resolveServerAddress(serverAddr);
    console.log(`[Connect] Resolved address: ${serverAddr} -> ${resolvedAddr}`);

    // Clear user-disconnected status on explicit login attempt
    const { serverAutoConnectService } = await import('../server-auto-connect-service');
    await serverAutoConnectService.clearUserDisconnected(username, resolvedAddr);

    // STEP 1: Check if session already exists
    console.log(`[Connect] Checking for existing session: ${username}@${resolvedAddr}`);

    try {
      const { connectionManager } = await import('../connection-manager');
      const activeSessions = await connectionManager.getActiveSessions();

      const existingSession = activeSessions.find(
        s => s.username === username && s.server_address === resolvedAddr
      );

      if (existingSession) {
        console.log(`[Connect] Found existing session CID ${existingSession.cid}`);

        // STEP 2: Check if session is orphaned
        const { connectionManager: cm } = await import('../connection-manager');
        const storedSession = cm.getStoredSessions().sessions.find(
          s => s.username === username && s.serverAddress === resolvedAddr
        );

        const isOrphaned = !storedSession?.cid || storedSession.cid !== existingSession.cid;

        if (isOrphaned) {
          // STEP 3a: Session is orphaned → Claim it
          console.log(`[Connect] Session is orphaned - claiming CID ${existingSession.cid}`);
          await this.config.claimSession(existingSession.cid, false);
          return;
        } else {
          // STEP 3b: Session exists but NOT orphaned → Disconnect then Connect
          console.warn(`[Connect] Session exists but not orphaned - disconnecting first`);
          await this.config.disconnect(existingSession.cid);
        }
      }
    } catch (error) {
      console.warn(`[Connect] Session check failed, proceeding with Connect:`, error);
    }

    // STEP 4: No existing session OR after disconnect → Proceed with Connect
    console.log(`[Connect] Proceeding with new connection for ${username}`);

    const connectOptions = {
      request_id: requestId,
      server_addr: resolvedAddr,
      username,
      password: stringToByteArray(password),
      connect_mode: { Standard: { force_login: true } },
      udp_mode: "Disabled",
      keep_alive_timeout: null,
      session_security_settings: {
        security_level: (sessionSecuritySettings?.securityLevel as string) || "Standard",
        secrecy_mode: (sessionSecuritySettings?.secrecyMode as string) || "BestEffort",
        header_obfuscator_settings: normalizeHeaderObfuscatorSettings(
          sessionSecuritySettings?.headerObfuscatorSettings
        ),
        crypto_params: {
          encryption_algorithm: (sessionSecuritySettings?.encryptionAlgorithm as string) || "AES_GCM_256",
          kem_algorithm: (sessionSecuritySettings?.kemAlgorithm as string) || "Kyber",
          sig_algorithm: (sessionSecuritySettings?.sigAlgorithm as string) || "None"
        },
      },
      server_password: serverPassword || null
    };

    const connectRequest = { Connect: connectOptions };

    console.log(`[Connect] Sending Connect request with request_id: ${requestId}`);
    console.log(`[Connect] isLeader: ${instanceManager.isLeader}`);

    try {
      await this.config.sendRequest(connectRequest, requestId);
      console.log(`[Connect] Connect request sent successfully for ${username}`);
    } catch (sendError) {
      console.error(`[Connect] FAILED to send Connect request:`, sendError);
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
    sessionSecuritySettings?: Record<string, unknown>
  ): Promise<void> {
    await this.config.init();

    // Resolve hostname to IP if needed (DNS resolution)
    const resolvedAddr = await resolveServerAddress(serverAddr);
    console.log(`[Register] Resolved address: ${serverAddr} -> ${resolvedAddr}`);

    const registerOptions = {
      request_id: requestId,
      server_addr: resolvedAddr,
      full_name: fullName,
      username,
      proposed_password: stringToByteArray(password),
      connect_after_register: true,
      session_security_settings: {
        security_level: (sessionSecuritySettings?.securityLevel as string) || "Standard",
        secrecy_mode: (sessionSecuritySettings?.secrecyMode as string) || "BestEffort",
        header_obfuscator_settings: normalizeHeaderObfuscatorSettings(
          sessionSecuritySettings?.headerObfuscatorSettings
        ),
        crypto_params: {
          encryption_algorithm: (sessionSecuritySettings?.encryptionAlgorithm as string) || "AES_GCM_256",
          kem_algorithm: (sessionSecuritySettings?.kemAlgorithm as string) || "Kyber",
          sig_algorithm: (sessionSecuritySettings?.sigAlgorithm as string) || "None"
        },
      },
      server_password: serverPassword || null
    };

    debugLog('websocket', 'Sending register options to WASM client', registerOptions);

    const registerRequest = { Register: registerOptions };

    debugLog('websocket', `[Register] isLeader: ${instanceManager.isLeader}`);

    await this.config.sendRequest(registerRequest, requestId);
  }
}
