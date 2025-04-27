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

export interface PeerSessionInformationTS {
  cid: string;
  peerCid: string;
  peerUsername: string;
}

export interface SessionInformationTS {
  cid: string;
  peerConnections: Record<string, PeerSessionInformationTS>; // HashMap<String, PeerSessionInformationTS> in Rust
}

export interface GetSessionSuccessTS {
  requestId?: string;
  sessions: SessionInformationTS[];
}

export interface GetSessionFailureTS {
  requestId?: string;
  message: string;
}

//
// Request Types
//

/**
 * ConnectMode enum - String values to match Rust enum variants (or desired representation)
 */
export enum ConnectMode {
  Standard = "Standard", // Assuming Rust uses these exact names via strum
  Fetch = "Fetch",
  // Add other modes if they exist, ensure names match Rust TryFrom/Parse logic
  // Example: StandardWithForcedLogin = "Standard { force_login: true }" - though this might be better handled by flags
}

/**
 * UdpMode enum - String values
 */
export enum UdpMode {
  Disabled = "Disabled", // Assuming Rust uses these exact names
  Enabled = "Enabled",
}

/**
 * SecurityLevel enum - String values
 */
export enum SecurityLevel {
  Standard = "Standard",
  Reinforced = "Reinforced",
  High = "High",
  Ultra = "Ultra",
  Extreme = "Extreme",
  // Custom levels might need special handling, maybe a separate field or specific string format
}

/**
 * SecrecyMode enum - String values
 */
export enum SecrecyMode {
  BestEffort = "BestEffort",
  Perfect = "Perfect",
}

/**
 * EncryptionAlgorithm enum - String values
 */
export enum EncryptionAlgorithm {
  AES_GCM_256 = "AES_GCM_256",
  ChaCha20Poly_1305 = "ChaCha20Poly_1305",
  KyberHybrid = "KyberHybrid",
  Ascon80pq = "Ascon80pq",
}

/**
 * KemAlgorithm enum - String values
 */
export enum KemAlgorithm {
  Kyber = "Kyber",
}

/**
 * SigAlgorithm enum - String values
 */
export enum SigAlgorithm {
  None = "None",
  Falcon1024 = "Falcon1024",
}

/**
 * SessionSecuritySettings structure for TypeScript
 */
export interface SessionSecuritySettingsTS {
  securityLevel: SecurityLevel | string; // Allow string for potential custom levels
  secrecyMode: SecrecyMode;
  encryptionAlgorithm: EncryptionAlgorithm;
  kemAlgorithm: KemAlgorithm;
  sigAlgorithm: SigAlgorithm;
  headerObfuscatorSettings: Record<string, string>; // Keep as Record<string, string>
}

/**
 * ConnectRequest structure for TypeScript
 */
export interface ConnectRequestTS {
  username: string;
  password: Uint8Array; // Password as Uint8Array
  connectMode: ConnectMode; // Use string enum
  udpMode: UdpMode; // Use string enum
  keepAliveTimeoutMs?: number; // Optional duration in milliseconds (number remains suitable)
  sessionSecuritySettings: SessionSecuritySettingsTS; // Use updated interface
  serverPassword?: Uint8Array; // Optional password as Uint8Array
}

/**
 * MessageRequest structure for TypeScript
 */
export interface MessageRequestTS {
  message: Uint8Array; // Message content as Uint8Array
  cid: string; // Connection ID (u64 as string)
  peerCid?: string; // Optional peer connection ID (u64 as string)
  securityLevel: SecurityLevel | string; // Use string enum/string
}

/**
 * RegistrationRequest structure for TypeScript
 */
export interface RegistrationRequestTS {
  workspaceIdentifier: string; // SocketAddr as string
  workspacePassword: string;
  sessionSecuritySettings: SessionSecuritySettingsTS; // Use updated interface
  fullName: string;
  username: string;
  profilePassword: string; // Note: Consider using Uint8Array if sensitive
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

export interface GetSessionRequestTS {
  // Currently no parameters needed for get_session
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
 * Converts Uint8Array to string for displaying binary data (if needed)
 */
export function uint8ArrayToString(arr: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(arr);
}