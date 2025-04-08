// Tauri API wrapper for invoking Rust commands
import { WorkspaceConfig } from '@/types/workspace';
import { invoke } from '@tauri-apps/api/core';

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

// Tauri API wrapper functions
export async function connect(request: ConnectRequestTS): Promise<ConnectResponseTS> {
  try {
    return await invoke<ConnectResponseTS>('connect', { request });
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
    // Make sure all numeric values are actually numbers, not strings
    const sanitizedRequest = {
      ...request,
      securityLevel: Number(request.securityLevel),
      securityMode: Number(request.securityMode),
      encryptionAlgorithm: Number(request.encryptionAlgorithm),
      kemAlgorithm: Number(request.kemAlgorithm),
      sigAlgorithm: Number(request.sigAlgorithm)
    };
    
    return await invoke<RegistrationResponseTS>('register', { request: sanitizedRequest });
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
    // Ensure cid is a string
    const sanitizedRequest = {
      ...request,
      cid: String(request.cid)
    };
    
    return await invoke<ListKnownServersResponseTS>('list_known_servers', { request: sanitizedRequest });
  } catch (error) {
    console.error('Error listing known servers:', error);
    return {
      servers: []
    };
  }
}

export async function listAllPeers(request: ListAllPeersRequestTS): Promise<ListAllPeersResponseTS> {
  try {
    // Ensure cid is a string
    const sanitizedRequest = {
      ...request,
      cid: String(request.cid)
    };
    
    return await invoke<ListAllPeersResponseTS>('list_all_peers', { request: sanitizedRequest });
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
    // Ensure cid and peerCid are strings
    const sanitizedRequest = {
      ...request,
      cid: String(request.cid),
      peerCid: String(request.peerCid)
    };
    
    return await invoke<PeerConnectResponseTS>('peer_connect', { request: sanitizedRequest });
  } catch (error) {
    console.error('Error connecting to peer:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
