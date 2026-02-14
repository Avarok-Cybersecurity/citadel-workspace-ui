/**
 * P2P Registration Service - Type Definitions
 *
 * All interfaces, type aliases, and re-exports for the P2P registration module.
 */

// Re-export security types from central location (DRY)
import {
  type SessionSecuritySettings,
  type HeaderObfuscatorSettings,
} from '../security-utils';

export type { SessionSecuritySettings, HeaderObfuscatorSettings };

export interface Peer {
  cid: bigint;
  username: string;
  fullName: string;
  isOnline: boolean;
  isRegistered: boolean;
}

/** Shape of peer info from ListAllPeers/ListRegisteredPeers backend responses */
export interface PeerInfoResponse {
  cid?: bigint;
  username?: string;
  peer_username?: string;
  name?: string;
  online_status?: boolean;
}

export interface PeerRegistrationOptions {
  autoRegisterAll?: boolean;
  sessionSecuritySettings?: SessionSecuritySettings;
  connectAfterRegister?: boolean;
}

/** Pending request tracking for promise-based request/response correlation */
export interface PendingRequestEntry {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
}
