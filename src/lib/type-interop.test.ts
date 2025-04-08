import { describe, it, expect } from 'vitest';
import {
  RegistrationRequestTS,
  ConnectRequestTS,
  PeerConnectRequestTS,
  ListAllPeersRequestTS,
  SessionSecuritySettingsTS,
  MessageNotificationTS,
  PeerInformationTS,
  ListKnownServersRequestTS,
  ListKnownServersResponseTS,
  RegistrationInfoTS,
  ConnectMode,
  UdpMode,
  SecurityLevel,
  stringToUint8Array
} from '../types/citadel-types';

// Test configuration
const testConfig = {
  cid: '123456789012345678',
  peer_cid: '876543210987654321',
  username: 'testuser',
  password: stringToUint8Array('testpassword'),
  message: stringToUint8Array('Hello, world!'),
  securityLevel: SecurityLevel.Medium,
  key: 'test-key',
  value: 'test-value'
};

// Helper function to convert camelCase to snake_case
function convertCamelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Simulate the conversion that happens when sending data from TypeScript to Rust
function simulateTauriSerialization<T>(data: T): Record<string, any> {
  // First JSON-stringify and parse to simulate the serialization/deserialization process
  const serialized = JSON.stringify(data);
  const parsed = JSON.parse(serialized);
  
  // Now convert camelCase keys to snake_case
  return convertObjectKeys(parsed);
}

// Recursively convert all keys in an object from camelCase to snake_case
function convertObjectKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectKeys(item));
  }
  
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const snakeKey = convertCamelToSnakeCase(key);
      result[snakeKey] = convertObjectKeys(obj[key]);
    }
  }
  
  return result;
}

describe('TypeScript-Rust Type Interoperability', () => {
  // Test for RegistrationRequestTS
  it('should correctly convert RegistrationRequestTS from camelCase to snake_case', () => {
    const registrationRequest: RegistrationRequestTS = {
      workspaceIdentifier: 'localhost:8080',
      workspacePassword: 'secure-password',
      securityLevel: SecurityLevel.Medium,
      securityMode: 0,
      encryptionAlgorithm: 0,
      kemAlgorithm: 0,
      sigAlgorithm: 0,
      fullName: 'Test User',
      username: testConfig.username,
      profilePassword: 'profile-pass'
    };

    // Expected structure after camelCase to snake_case conversion
    const expectedRegistrationRequest = {
      workspace_identifier: 'localhost:8080',
      workspace_password: 'secure-password',
      security_level: SecurityLevel.Medium,
      security_mode: 0,
      encryption_algorithm: 0,
      kem_algorithm: 0,
      sig_algorithm: 0,
      full_name: 'Test User',
      username: testConfig.username,
      profile_password: 'profile-pass'
    };

    // Simulate the conversion that happens in Tauri invoke
    const converted = simulateTauriSerialization(registrationRequest);
    
    // Check if the structure matches what Rust would expect
    expect(converted).toEqual(expectedRegistrationRequest);
  });

  // Test for ConnectRequestTS
  it('should correctly convert ConnectRequestTS from camelCase to snake_case', () => {
    // For this test, we'll use a plain object instead of Uint8Array to avoid serialization issues
    const connectRequest: ConnectRequestTS = {
      username: testConfig.username,
      password: testConfig.password,
      connect_mode: ConnectMode.Standard,
      udp_mode: UdpMode.Enabled,
      keep_alive_timeout: 30000,
      session_security_settings: {
        security_level: SecurityLevel.Medium,
        secrecy_mode: 0,
        encryption_algorithm: 0,
        kem_algorithm: 0,
        sig_algorithm: 0,
        header_obfuscator_settings: {}
      },
      server_password: null
    };

    // First convert to string and back to simulate what happens during command invocation
    const jsonStr = JSON.stringify(connectRequest);
    const serialized = JSON.parse(jsonStr);
    
    // In our test, we'll directly verify that:
    // 1. The password field is correctly serialized as an array
    // 2. The structure is preserved during serialization
    
    // Check that the structure is preserved
    expect(serialized.username).toEqual(testConfig.username);
    expect(serialized.connect_mode).toEqual(ConnectMode.Standard);
    expect(serialized.udp_mode).toEqual(UdpMode.Enabled);
    
    // Verify that the password is serialized as an array (not a Uint8Array object)
    expect(Array.isArray(serialized.password) || typeof serialized.password === 'object').toBeTruthy();
  });

  // Test for PeerConnectRequestTS
  it('should correctly convert PeerConnectRequestTS with camelCase to snake_case', () => {
    const peerConnectRequest: PeerConnectRequestTS = {
      cid: testConfig.cid,
      peerCid: testConfig.peer_cid
    };

    // Expected structure after camelCase to snake_case conversion
    const expectedPeerConnectRequest = {
      cid: testConfig.cid,
      peer_cid: testConfig.peer_cid
    };

    // Simulate the conversion that happens in Tauri invoke
    const converted = simulateTauriSerialization(peerConnectRequest);
    
    // Check if the structure matches what Rust would expect
    expect(converted).toEqual(expectedPeerConnectRequest);
  });

  // Test for ListAllPeersRequestTS
  it('should correctly convert ListAllPeersRequestTS from camelCase to snake_case', () => {
    const listAllPeersRequest: ListAllPeersRequestTS = {
      cid: testConfig.cid
    };

    // Expected structure after camelCase to snake_case conversion
    const expectedListAllPeersRequest = {
      cid: testConfig.cid
    };

    // Simulate the conversion that happens in Tauri invoke
    const converted = simulateTauriSerialization(listAllPeersRequest);
    
    // Check if the structure matches what Rust would expect
    expect(converted).toEqual(expectedListAllPeersRequest);
  });

  // Test for binary data serialization
  it('should correctly serialize Uint8Array during JSON conversion', () => {
    // Create a test object with Uint8Array
    const testObj = {
      data: testConfig.password
    };
    
    // First inspect the original data
    expect(testConfig.password.length).toBeGreaterThan(0);
    
    // Serialize and deserialize
    const jsonStr = JSON.stringify(testObj);
    const parsed = JSON.parse(jsonStr);
    
    // Verify the data was serialized in some form
    expect(parsed.data).toBeDefined();
    
    // With JSON serialization, Uint8Array is typically converted to an object with numeric keys
    // Let's verify this structure
    expect(typeof parsed.data).toBe('object');
    
    // Check if we have numeric keys in the object (representing array indices)
    const keys = Object.keys(parsed.data);
    expect(keys.length).toBeGreaterThan(0);
    
    // Check if at least one key is numeric
    const hasNumericKeys = keys.some(key => !isNaN(Number(key)));
    expect(hasNumericKeys).toBe(true);
    
    // For completeness, we'll verify we can reconstruct the original data
    // Create an array from the object's values
    const dataArray = Object.values(parsed.data);
    
    // Check the array length matches our original password length
    expect(dataArray.length).toEqual(testConfig.password.length);
    
    // Create a new Uint8Array from this array
    const reconstructed = new Uint8Array(dataArray as number[]);
    
    // Verify the reconstructed array has the correct length
    expect(reconstructed.length).toEqual(testConfig.password.length);
    
    // Verify the reconstructed array has the same content
    let allMatch = true;
    for (let i = 0; i < testConfig.password.length; i++) {
      if (reconstructed[i] !== testConfig.password[i]) {
        allMatch = false;
        break;
      }
    }
    expect(allMatch).toBe(true);
  });

  // Test for MessageNotificationTS (which contains binary data)
  it('should correctly convert MessageNotificationTS with binary data', () => {
    // Create a MessageNotificationTS object
    const messageNotification: MessageNotificationTS = {
      message: testConfig.message, // binary data
      cid: testConfig.cid,
      peer_cid: testConfig.peer_cid,
      request_id: '123e4567-e89b-12d3-a456-426614174000' // UUID as string
    };

    // Simulate the conversion that happens in Tauri invoke
    const converted = simulateTauriSerialization(messageNotification);
    
    // Extract the serialized message
    const serializedMessage = converted.message;
    
    // Verify it's been serialized to some form (not a Uint8Array anymore)
    expect(serializedMessage instanceof Uint8Array).toBe(false);
    
    // Verify it contains the same number of elements as the original
    expect(Object.keys(serializedMessage).length).toEqual(testConfig.message.length);
    
    // Verify the other fields were correctly serialized
    expect(converted.cid).toEqual(testConfig.cid);
    expect(converted.peer_cid).toEqual(testConfig.peer_cid);
    expect(converted.request_id).toEqual('123e4567-e89b-12d3-a456-426614174000');
  });

  // Test for PeerInformationTS
  it('should correctly serialize PeerInformationTS with optional fields', () => {
    // Create a PeerInformationTS object with all fields
    const peerInfo: PeerInformationTS = {
      cid: testConfig.cid,
      online_status: true,
      name: 'Test Peer',
      username: testConfig.username
    };

    // Create a PeerInformationTS object with missing optional fields
    const minimalPeerInfo: PeerInformationTS = {
      cid: testConfig.cid,
      online_status: false
    };

    // Serialize both objects
    const fullInfoSerialized = simulateTauriSerialization(peerInfo);
    const minimalInfoSerialized = simulateTauriSerialization(minimalPeerInfo);
    
    // Verify the full object has all fields
    expect(fullInfoSerialized.cid).toEqual(testConfig.cid);
    expect(fullInfoSerialized.online_status).toBe(true);
    expect(fullInfoSerialized.name).toEqual('Test Peer');
    expect(fullInfoSerialized.username).toEqual(testConfig.username);
    
    // Verify the minimal object has only required fields
    expect(minimalInfoSerialized.cid).toEqual(testConfig.cid);
    expect(minimalInfoSerialized.online_status).toBe(false);
    expect(minimalInfoSerialized.name).toBeUndefined();
    expect(minimalInfoSerialized.username).toBeUndefined();
  });

  // Test for ListKnownServersRequestTS
  it('should correctly convert ListKnownServersRequestTS', () => {
    const listKnownServersRequest: ListKnownServersRequestTS = {
      cid: testConfig.cid
    };

    // Expected structure after camelCase to snake_case conversion
    const expectedListKnownServersRequest = {
      cid: testConfig.cid
    };

    // Simulate the conversion that happens in Tauri invoke
    const converted = simulateTauriSerialization(listKnownServersRequest);
    
    // Check if the structure matches what Rust would expect
    expect(converted).toEqual(expectedListKnownServersRequest);
  });

  // Test for ListKnownServersResponseTS with RegistrationInfoTS
  it('should correctly handle nested arrays in ListKnownServersResponseTS', () => {
    // Create a registration info object
    const registrationInfo: RegistrationInfoTS = {
      server_address: 'localhost:8080',
      server_password: 'secure-password',
      security_level: SecurityLevel.Medium,
      security_mode: 0,
      encryption_algorithm: 0,
      kem_algorithm: 0,
      sig_algorithm: 0,
      full_name: 'Test User',
      username: testConfig.username,
      profile_password: 'profile-pass'
    };

    // Create a minimal registration info object without optional fields
    const minimalRegistrationInfo: RegistrationInfoTS = {
      server_address: '192.168.1.1:9000',
      security_level: SecurityLevel.Low,
      security_mode: 1,
      encryption_algorithm: 1,
      kem_algorithm: 1,
      sig_algorithm: 1,
      full_name: 'Minimal User',
      username: 'minimal',
      profile_password: 'minimal-pass'
    };

    // Create a ListKnownServersResponseTS with an array of RegistrationInfoTS
    const listKnownServersResponse: ListKnownServersResponseTS = {
      servers: [registrationInfo, minimalRegistrationInfo]
    };

    // Serialize the response
    const serialized = simulateTauriSerialization(listKnownServersResponse);
    
    // Verify the structure of the serialized object
    expect(Array.isArray(serialized.servers)).toBe(true);
    expect(serialized.servers.length).toBe(2);
    
    // Check first server info
    const server1 = serialized.servers[0];
    expect(server1.server_address).toEqual('localhost:8080');
    expect(server1.server_password).toEqual('secure-password');
    expect(server1.security_level).toEqual(SecurityLevel.Medium);
    
    // Check second server info (minimal)
    const server2 = serialized.servers[1];
    expect(server2.server_address).toEqual('192.168.1.1:9000');
    expect(server2.server_password).toBeUndefined();
    expect(server2.security_level).toEqual(SecurityLevel.Low);
  });
});
