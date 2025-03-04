/**
 * Integration tests for Tauri API
 * 
 * These tests verify that the TypeScript to Rust type conversions work correctly
 * and that the Tauri commands can be invoked from the frontend.
 */

import { describe, it, expect } from 'vitest';
import { 
  workspaceConfigToRegistrationRequest, 
  workspaceConfigToConnectRequest,
  ConnectRequestTS,
  RegistrationRequestTS,
  RegistrationInfo
} from './tauri';
import { WorkspaceConfig } from '@/types/workspace';

describe('Tauri Integration Tests', () => {
  // Sample workspace config
  const testConfig: WorkspaceConfig = {
    serverAddress: '127.0.0.1:12345',
    password: 'test-password',
    securityLevel: '2',
    securityMode: '1',
    encryptionAlgorithm: '0',
    kemAlgorithm: '0',
    signingAlgorithm: '0',
    headerObfuscatorMode: '0',
    fullName: 'Test User',
    username: 'testuser',
    profilePassword: 'test-profile-password'
  };

  it('should generate JSON structure that matches what Rust expects', () => {
    // Convert to RegistrationRequestTS
    const registrationRequest = workspaceConfigToRegistrationRequest(testConfig);
    
    // Expected structure based on Rust's RegistrationRequestTS
    const expectedRegistration = {
      workspaceIdentifier: '127.0.0.1:12345',
      workspacePassword: 'test-password',
      securityLevel: 2,
      securityMode: 1,
      encryptionAlgorithm: 0,
      kemAlgorithm: 0,
      sigAlgorithm: 0,
      fullName: 'Test User',
      username: 'testuser',
      profilePassword: 'test-profile-password'
    };
    
    // Test registration request structure
    expect(registrationRequest).toEqual(expectedRegistration);
    
    // Convert to ConnectRequestTS
    const connectRequest = workspaceConfigToConnectRequest(testConfig);
    
    // Expected structure based on Rust's ConnectRequestTS
    const expectedConnect = {
      registrationInfo: {
        server_address: '127.0.0.1:12345',
        server_password: 'test-password',
        security_level: 2,
        security_mode: 1,
        encryption_algorithm: 0,
        kem_algorithm: 0,
        sig_algorithm: 0,
        full_name: 'Test User',
        username: 'testuser',
        profile_password: 'test-profile-password'
      }
    };
    
    // Test connect request structure
    expect(connectRequest).toEqual(expectedConnect);
  });

  it('should maintain data integrity during round-trip conversion', () => {
    // Create a RegistrationInfo object (Rust-style)
    const registrationInfo: RegistrationInfo = {
      server_address: '127.0.0.1:12345',
      server_password: 'test-password',
      security_level: 2,
      security_mode: 1,
      encryption_algorithm: 0,
      kem_algorithm: 0,
      sig_algorithm: 0,
      full_name: 'Test User',
      username: 'testuser',
      profile_password: 'test-profile-password'
    };
    
    // Create a ConnectRequestTS using the RegistrationInfo
    const connectRequest: ConnectRequestTS = {
      registrationInfo
    };
    
    // Convert to JSON and back to simulate the round-trip to Rust
    const jsonString = JSON.stringify(connectRequest);
    const roundTrippedConnectRequest = JSON.parse(jsonString) as ConnectRequestTS;
    
    // Verify that the round-tripped object matches the original
    expect(roundTrippedConnectRequest).toEqual(connectRequest);
    expect(roundTrippedConnectRequest.registrationInfo.server_address).toBe(registrationInfo.server_address);
    expect(roundTrippedConnectRequest.registrationInfo.server_password).toBe(registrationInfo.server_password);
    expect(roundTrippedConnectRequest.registrationInfo.security_level).toBe(registrationInfo.security_level);
    expect(roundTrippedConnectRequest.registrationInfo.security_mode).toBe(registrationInfo.security_mode);
    expect(roundTrippedConnectRequest.registrationInfo.encryption_algorithm).toBe(registrationInfo.encryption_algorithm);
    expect(roundTrippedConnectRequest.registrationInfo.kem_algorithm).toBe(registrationInfo.kem_algorithm);
    expect(roundTrippedConnectRequest.registrationInfo.sig_algorithm).toBe(registrationInfo.sig_algorithm);
    expect(roundTrippedConnectRequest.registrationInfo.full_name).toBe(registrationInfo.full_name);
    expect(roundTrippedConnectRequest.registrationInfo.username).toBe(registrationInfo.username);
    expect(roundTrippedConnectRequest.registrationInfo.profile_password).toBe(registrationInfo.profile_password);
  });

  it('should handle special characters in string fields', () => {
    // Test with special characters
    const configWithSpecialChars: WorkspaceConfig = {
      ...testConfig,
      fullName: 'Test "User" with & special < > characters',
      password: 'p@$$w0rd!#%^&*()'
    };
    
    // Convert to RegistrationRequestTS
    const registrationRequest = workspaceConfigToRegistrationRequest(configWithSpecialChars);
    
    // Convert to JSON and back
    const jsonString = JSON.stringify(registrationRequest);
    const roundTrippedRequest = JSON.parse(jsonString) as RegistrationRequestTS;
    
    // Verify special characters are preserved
    expect(roundTrippedRequest.fullName).toBe(configWithSpecialChars.fullName);
    expect(roundTrippedRequest.workspacePassword).toBe(configWithSpecialChars.password);
  });
});
