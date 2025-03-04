import { describe, it, expect } from 'vitest';
import { 
  workspaceConfigToRegistrationRequest, 
  workspaceConfigToConnectRequest,
  ConnectRequestTS,
  RegistrationRequestTS
} from './tauri';
import { WorkspaceConfig } from '@/types/workspace';

describe('Tauri Type Conversions', () => {
  // Test case 1: Basic workspace config
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

  it('should correctly convert WorkspaceConfig to RegistrationRequestTS', () => {
    // Convert to RegistrationRequestTS
    const registrationRequest = workspaceConfigToRegistrationRequest(testConfig);
    
    // Validate registration request
    expect(registrationRequest.workspaceIdentifier).toBe(testConfig.serverAddress);
    expect(registrationRequest.workspacePassword).toBe(testConfig.password);
    expect(registrationRequest.securityLevel).toBe(parseInt(testConfig.securityLevel, 10));
    expect(registrationRequest.securityMode).toBe(parseInt(testConfig.securityMode, 10));
    expect(registrationRequest.encryptionAlgorithm).toBe(parseInt(testConfig.encryptionAlgorithm, 10));
    expect(registrationRequest.kemAlgorithm).toBe(parseInt(testConfig.kemAlgorithm, 10));
    expect(registrationRequest.sigAlgorithm).toBe(parseInt(testConfig.signingAlgorithm, 10));
    expect(registrationRequest.fullName).toBe(testConfig.fullName);
    expect(registrationRequest.username).toBe(testConfig.username);
    expect(registrationRequest.profilePassword).toBe(testConfig.profilePassword);
  });

  it('should correctly convert WorkspaceConfig to ConnectRequestTS', () => {
    // Convert to ConnectRequestTS
    const connectRequest = workspaceConfigToConnectRequest(testConfig);
    
    // Validate connect request
    expect(connectRequest.registrationInfo.server_address).toBe(testConfig.serverAddress);
    expect(connectRequest.registrationInfo.server_password).toBe(testConfig.password);
    expect(connectRequest.registrationInfo.security_level).toBe(parseInt(testConfig.securityLevel, 10));
    expect(connectRequest.registrationInfo.security_mode).toBe(parseInt(testConfig.securityMode, 10));
    expect(connectRequest.registrationInfo.encryption_algorithm).toBe(parseInt(testConfig.encryptionAlgorithm, 10));
    expect(connectRequest.registrationInfo.kem_algorithm).toBe(parseInt(testConfig.kemAlgorithm, 10));
    expect(connectRequest.registrationInfo.sig_algorithm).toBe(parseInt(testConfig.signingAlgorithm, 10));
    expect(connectRequest.registrationInfo.full_name).toBe(testConfig.fullName);
    expect(connectRequest.registrationInfo.username).toBe(testConfig.username);
    expect(connectRequest.registrationInfo.profile_password).toBe(testConfig.profilePassword);
  });

  it('should handle empty password in WorkspaceConfig', () => {
    // Test with empty password
    const configWithEmptyPassword: WorkspaceConfig = {
      ...testConfig,
      password: ''
    };
    
    // Test registration request
    const registrationRequest = workspaceConfigToRegistrationRequest(configWithEmptyPassword);
    expect(registrationRequest.workspacePassword).toBe('');
    
    // Test connect request
    const connectRequest = workspaceConfigToConnectRequest(configWithEmptyPassword);
    expect(connectRequest.registrationInfo.server_password).toBeUndefined();
  });

  it('should handle undefined password in WorkspaceConfig', () => {
    // Test with undefined password
    const configWithUndefinedPassword: WorkspaceConfig = {
      ...testConfig,
      password: undefined
    };
    
    // Test registration request
    const registrationRequest = workspaceConfigToRegistrationRequest(configWithUndefinedPassword);
    expect(registrationRequest.workspacePassword).toBe('');
    
    // Test connect request
    const connectRequest = workspaceConfigToConnectRequest(configWithUndefinedPassword);
    expect(connectRequest.registrationInfo.server_password).toBeUndefined();
  });
});
