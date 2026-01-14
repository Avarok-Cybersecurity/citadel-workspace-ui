export type SecurityLevel = 'Standard' | 'Reinforced' | 'High' | 'Extreme';
export type SecrecyMode = 'Perfect' | 'BestEffort';
export type EncryptionAlgorithm = 'AES_GCM_256' | 'ChaCha20Poly_1305' | 'KyberHybrid' | 'Ascon80pq';
export type KemAlgorithm = 'Kyber';
export type SigAlgorithm = 'None' |'Falcon1024' | 'Dilithium5';

export enum ConnectMode {
  Fetch = "Fetch",
  Standard = "Standard"
}

export enum UdpMode {
  Enabled = "Enabled",
  Disabled = "Disabled"
}

export function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}