/**
 * citadel-types.ts
 * 
 * Central location for all TypeScript type definitions used in communication
 * with the Rust backend. This file mirrors the types defined in src-tauri/src/types.rs.
 * 
 * IMPORTANT NOTES ON TYPE CONVERSIONS:
 * - u64 in Rust is represented as string in TypeScript to prevent data loss
 * - Uuid in Rust is represented as string in TypeScript
 * - Vec<u8> in Rust is represented as Uint8Array in TypeScript
 * - Option<T> in Rust is represented as T | undefined in TypeScript
 * - HashMap<K, V> in Rust is represented as Record<K, V> in TypeScript
 */

//
// Response Types
//

export interface ConnectSuccessTS {
  cid: string;  // u64 as string to prevent data loss
  request_id?: string;  // Optional Uuid as string
}

export interface ConnectFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface RegisterSuccessTS {
  cid: string;
  request_id?: string;
}

export interface RegisterFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface MessageSendSuccessTS {
  cid: string;
  peer_cid?: string;
  request_id?: string;
}

export interface MessageSendFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface MessageNotificationTS {
  message: Uint8Array;
  cid: string;
  peer_cid: string;
  request_id?: string;
}

export interface DisconnectNotificationTS {
  cid: string;
  peer_cid?: string;
  request_id?: string;
}

export interface DisconnectFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface PeerConnectSuccessTS {
  cid: string;
  peer_cid: string;
  request_id?: string;
}

export interface PeerConnectFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface PeerDisconnectSuccessTS {
  cid: string;
  request_id?: string;
}

export interface PeerDisconnectFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface LocalDBGetKVSuccessTS {
  cid: string;
  peer_cid?: string;
  key: string;
  value: Uint8Array;
  request_id?: string;
}

export interface LocalDBGetKVFailureTS {
  cid: string;
  peer_cid?: string;
  message: string;
  request_id?: string;
}

export interface LocalDBSetKVSuccessTS {
  cid: string;
  peer_cid?: string;
  key: string;
  request_id?: string;
}

export interface LocalDBSetKVFailureTS {
  cid: string;
  peer_cid?: string;
  message: string;
  request_id?: string;
}

export interface ListAllPeersResponseTS {
  cid: string;
  peers: Record<string, PeerInformationTS>;  // HashMap<String, PeerInformationTS> in Rust
  request_id?: string;
}

export interface ListAllPeersFailureTS {
  cid: string;
  message: string;
  request_id?: string;
}

export interface PeerInformationTS {
  cid: string;
  online_status: boolean;
  name?: string;
  username?: string;
}

//
// Request Types
//

export interface ConnectRequestTS {
  username: string;
  password: Uint8Array;  // SecBuffer in Rust
  connect_mode: number;  // ConnectMode enum in Rust
  udp_mode: number;      // UdpMode enum in Rust
  keep_alive_timeout?: number;  // Option<Duration> in Rust (milliseconds)
  session_security_settings: SessionSecuritySettingsTS;
  server_password?: Uint8Array;  // Option<PreSharedKey> in Rust
}

export interface RegistrationRequestTS {
  workspaceIdentifier: string;   // SocketAddr as string
  workspacePassword: string;
  securityLevel: number;
  securityMode: number;
  encryptionAlgorithm: number;
  kemAlgorithm: number;
  sigAlgorithm: number;
  fullName: string;
  username: string;
  profilePassword: string;
}

export interface SessionSecuritySettingsTS {
  security_level: number;
  secrecy_mode: number;
  encryption_algorithm: number;
  kem_algorithm: number;
  sig_algorithm: number;
  header_obfuscator_settings: Record<string, string>;
}

export interface ListKnownServersRequestTS {
  cid: string;
}

export interface ListKnownServersResponseTS {
  servers: RegistrationInfoTS[];
}

export interface RegistrationInfoTS {
  server_address: string;
  server_password?: string;
  security_level: number;
  security_mode: number;
  encryption_algorithm: number;
  kem_algorithm: number;
  sig_algorithm: number;
  full_name: string;
  username: string;
  profile_password: string;
}

export interface PeerConnectRequestTS {
  cid: string;
  peerCid: string;
}

export interface PeerConnectResponseTS {
  success: boolean;
  message?: string;
}

export interface ListAllPeersRequestTS {
  cid: string;
}

// Enum definitions to match Rust enums

/**
 * ConnectMode enum - must match the Rust enum
 */
export enum ConnectMode {
  Standard = 0,
  Lite = 1,
}

/**
 * UdpMode enum - must match the Rust enum
 */
export enum UdpMode {
  Disabled = 0,
  Enabled = 1,
}

/**
 * SecurityLevel enum - must match the Rust enum
 */
export enum SecurityLevel {
  Low = 0,
  Medium = 1,
  High = 2,
}

/**
 * Helper functions for TypeScript to ensure proper type handling
 */

/**
 * Converts string to Uint8Array for password handling
 */
export function stringToUint8Array(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Converts Uint8Array to string for displaying binary data
 */
export function uint8ArrayToString(array: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(array);
}

/**
 * Generates a UUID string
 */
export function generateUUID(): string {
  // This is a simple UUID v4 implementation. In production, use a proper UUID library
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
