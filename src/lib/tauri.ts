// Tauri API wrapper for invoking Rust commands
import { WorkspaceConfig } from '@/types/workspace';

// Define the types that mirror the Rust types
export interface ConnectRequestTS {
  registrationInfo: RegistrationInfo;
}

export interface ConnectResponseTS {
  cid?: string;
  success: boolean;
  message: string;
}

export interface RegistrationInfo {
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

export interface RegistrationRequestTS {
  workspaceIdentifier: string;
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

export interface RegistrationResponseTS {
  message: string;
  success: boolean;
}

export interface ListKnownServersRequestTS {
  cid: string;
}

export interface ListKnownServersResponseTS {
  servers: RegistrationInfo[];
}

export interface ListAllPeersRequestTS {
  cid: string;
}

export interface PeerInformation {
  username: string;
  full_name: string;
  // Add other fields as needed based on the Rust PeerInformation struct
}

export interface ListAllPeersResponseTS {
  peers?: Record<string, PeerInformation>;
  success: boolean;
  message: string;
}

export interface PeerConnectRequestTS {
  cid: string;
  peerCid: string;
}

export interface PeerConnectResponseTS {
  success: boolean;
  message?: string;
}

// Convert from WorkspaceConfig (frontend type) to RegistrationRequestTS (Tauri bridge type)
export function workspaceConfigToRegistrationRequest(config: WorkspaceConfig): RegistrationRequestTS {
  return {
    workspaceIdentifier: config.serverAddress,
    workspacePassword: config.password || '',
    securityLevel: parseInt(config.securityLevel, 10),
    securityMode: parseInt(config.securityMode, 10),
    encryptionAlgorithm: parseInt(config.encryptionAlgorithm, 10),
    kemAlgorithm: parseInt(config.kemAlgorithm, 10),
    sigAlgorithm: parseInt(config.signingAlgorithm, 10),
    fullName: config.fullName,
    username: config.username,
    profilePassword: config.profilePassword
  };
}

// Convert from WorkspaceConfig (frontend type) to ConnectRequestTS (Tauri bridge type)
export function workspaceConfigToConnectRequest(config: WorkspaceConfig): ConnectRequestTS {
  return {
    registrationInfo: {
      server_address: config.serverAddress,
      server_password: config.password || undefined,
      security_level: parseInt(config.securityLevel, 10),
      security_mode: parseInt(config.securityMode, 10),
      encryption_algorithm: parseInt(config.encryptionAlgorithm, 10),
      kem_algorithm: parseInt(config.kemAlgorithm, 10),
      sig_algorithm: parseInt(config.signingAlgorithm, 10),
      full_name: config.fullName,
      username: config.username,
      profile_password: config.profilePassword
    }
  };
}

// Declare the Tauri API
declare global {
  interface Window {
    __TAURI__: {
      invoke<T>(cmd: string, args?: unknown): Promise<T>;
    };
  }
}

// Tauri API wrapper functions
export async function connect(request: ConnectRequestTS): Promise<ConnectResponseTS> {
  try {
    return await window.__TAURI__.invoke<ConnectResponseTS>('connect', { request });
  } catch (error) {
    console.error('Error connecting:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function register(request: RegistrationRequestTS): Promise<RegistrationResponseTS> {
  try {
    return await window.__TAURI__.invoke<RegistrationResponseTS>('register', { request });
  } catch (error) {
    console.error('Error registering:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function listKnownServers(request: ListKnownServersRequestTS): Promise<ListKnownServersResponseTS> {
  try {
    return await window.__TAURI__.invoke<ListKnownServersResponseTS>('list_known_servers', { request });
  } catch (error) {
    console.error('Error listing known servers:', error);
    return {
      servers: []
    };
  }
}

export async function listAllPeers(request: ListAllPeersRequestTS): Promise<ListAllPeersResponseTS> {
  try {
    return await window.__TAURI__.invoke<ListAllPeersResponseTS>('list_all_peers', { request });
  } catch (error) {
    console.error('Error listing peers:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function peerConnect(request: PeerConnectRequestTS): Promise<PeerConnectResponseTS> {
  try {
    return await window.__TAURI__.invoke<PeerConnectResponseTS>('peer_connect', { request });
  } catch (error) {
    console.error('Error connecting to peer:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
