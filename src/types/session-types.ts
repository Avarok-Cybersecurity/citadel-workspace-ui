/**
 * Session types for managing persistent connections
 */

/**
 * Represents a stored session for auto-reconnection
 */
export interface StoredSession {
  username: string;
  password: string; // Note: This should be encrypted in production
  serverAddress: string;
  fullName: string;
  lastConnected: number;
  cid?: string; // Store the CID for claiming orphaned sessions
  sessionSecuritySettings?: {
    securityLevel: string;
    secrecyMode: string;
    encryptionAlgorithm: string;
    kemAlgorithm: string;
    sigAlgorithm: string;
    headerObfuscatorSettings: string;
  };
}

/**
 * Collection of stored sessions
 */
export interface StoredSessions {
  sessions: StoredSession[];
  activeSessionIndex?: number;
}

/**
 * Connection info returned after successful connection
 */
export interface ConnectionInfo {
  cid: string;
  username: string;
  serverAddress: string;
  fullName: string;
}

/**
 * LocalDB key-value pair
 */
export interface LocalDBKVPair {
  key: string;
  value: any;
}

/**
 * LocalDB request types
 */
export interface LocalDBSetKVRequest {
  cid: string;
  peer_cid?: string;
  key: string;
  value: any;
  request_id: string;
}

export interface LocalDBGetKVRequest {
  cid: string;
  peer_cid?: string;
  key: string;
  request_id: string;
}

export interface LocalDBGetAllKVRequest {
  cid: string;
  peer_cid?: string;
  request_id: string;
}

/**
 * LocalDB response types
 */
export interface LocalDBSetKVSuccess {
  cid: string;
  peer_cid?: string;
  key: string;
  request_id: string;
}

export interface LocalDBGetKVSuccess {
  cid: string;
  peer_cid?: string;
  key: string;
  value: any;
  request_id: string;
}

export interface LocalDBGetAllKVSuccess {
  cid: string;
  peer_cid?: string;
  map: { [key: string]: any };
  request_id: string;
}

/**
 * Key names for LocalDB storage
 */
export const SESSION_STORAGE_KEY = 'citadel_sessions';
export const ACTIVE_SESSION_KEY = 'citadel_active_session';

/**
 * Peer connection information within a session
 */
export interface PeerSessionInformation {
  cid: string;
  peer_cid: string;
  peer_username: string;
}

/**
 * Active session info from internal service
 */
export interface ActiveSession {
  cid: string;
  username: string;
  server_address: string;
  full_name?: string;
  /** Peers this session is connected to (peer_cid -> PeerSessionInformation) */
  peer_connections?: Record<string, PeerSessionInformation>;
}

/**
 * GetSessions request to internal service
 */
export interface GetSessionsRequest {
  request_id: string;
}

/**
 * GetSessions response from internal service
 */
export interface GetSessionsResponse {
  request_id: string;
  sessions: ActiveSession[];
}