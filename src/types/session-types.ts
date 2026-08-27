/**
 * Session types for managing persistent connections
 */

import { SessionSecuritySettings } from "@/lib/p2p-registration-service";

/**
 * Represents a stored session for auto-reconnection
 */
export interface StoredSession {
  username: string;
  /**
   * Absent when the user declined "Remember Credentials".
   *
   * This was required, and every login wrote it regardless of the toggle — the
   * switch was read into component state and never reached the storage path, so
   * a user on a security product who declined credential storage had their
   * password written to LocalDB anyway and silently reused to re-authenticate.
   * Auto-reconnect already skips sessions with no password; the two direct
   * reconnect paths now refuse rather than sending undefined.
   */
  password?: string;
  serverAddress: string;
  /**
   * The workspace's pre-shared key. Optional because it is only kept when the
   * user asked for their credentials to be remembered -- it used to be stored
   * unconditionally, beside an account password that was correctly gated.
   */
  serverPassword?: string;
  fullName: string;
  lastConnected: number;
  cid?: bigint; // Store the CID for claiming orphaned sessions
  role?: string; // User's role in the workspace (Admin, Owner, Member, Guest)
  sessionSecuritySettings: SessionSecuritySettings
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
  cid: bigint;
  username: string;
  serverAddress: string;
  fullName: string;
}

/**
 * LocalDB key-value pair
 */
export interface LocalDBKVPair {
  key: string;
  value: number[];
}

/**
 * LocalDB request types
 */
export interface LocalDBSetKVRequest {
  cid: bigint;
  peer_cid?: bigint;
  key: string;
  value: number[];
  request_id: string;
}

export interface LocalDBGetKVRequest {
  cid: bigint;
  peer_cid?: bigint;
  key: string;
  request_id: string;
}

export interface LocalDBGetAllKVRequest {
  cid: bigint;
  peer_cid?: bigint;
  request_id: string;
}

/**
 * LocalDB response types
 */
export interface LocalDBSetKVSuccess {
  cid: bigint;
  peer_cid?: bigint;
  key: string;
  request_id: string;
}

export interface LocalDBGetKVSuccess {
  cid: bigint;
  peer_cid?: bigint;
  key: string;
  value: number[];
  request_id: string;
}

export interface LocalDBGetAllKVSuccess {
  cid: bigint;
  peer_cid?: bigint;
  map: Record<string, number[]>;
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
  cid: bigint;
  peer_cid: bigint;
  peer_username: string;
}

/**
 * Active session info from internal service
 */
export interface ActiveSession {
  cid: bigint;
  username: string;
  server_address: string;
  full_name?: string;
  /** Peers this session is connected to (peer_cid as string key -> PeerSessionInformation) */
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