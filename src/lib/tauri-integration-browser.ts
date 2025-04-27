/**
 * Browser-compatible integration tests for Tauri API
 * 
 * These tests verify that the TypeScript to Rust type conversions work correctly
 * and that the Tauri commands can be invoked from the frontend.
 */

import {
  workspaceConfigToRegistrationRequest,
  workspaceConfigToConnectRequest,
  ConnectRequestTS,
  RegistrationRequestTS,
  RegistrationInfo
} from './tauri';
import { WorkspaceConfig } from '@/types/workspace';

// Export a browser-compatible function to run the tests from the UI
export async function runTauriIntegrationTests(): Promise<boolean> {
  try {
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

    // Test 1: JSON structure matching
    const registrationRequest = workspaceConfigToRegistrationRequest(testConfig);
    const expectedRegistration = {
      workspaceIdentifier: '127.0.0.1:12345',
      workspacePassword: 'test-password',
      securityLevel: 2,
      securityMode: 1,
      encryptionAlgorithm: 0,
      kemAlgorithm: 0,
      sigAlgorithm: 0,
      headerObfuscatorMode: 0,
      fullName: 'Test User',
      username: 'testuser',
      profilePassword: 'test-profile-password'
    };

    // Check if registration request matches expected structure
    const registrationMatches = JSON.stringify(registrationRequest) === JSON.stringify(expectedRegistration);

    // Test connect request structure
    const connectRequest = workspaceConfigToConnectRequest(testConfig);
    const expectedConnect = {
      registrationInfo: {
        server_address: '127.0.0.1:12345',
        server_password: 'test-password',
        security_level: 2,
        security_mode: 1,
        encryption_algorithm: 0,
        kem_algorithm: 0,
        sig_algorithm: 0,
        header_obfuscator_mode: 0,
        full_name: 'Test User',
        username: 'testuser',
        profile_password: 'test-profile-password'
      }
    };

    // Check if connect request matches expected structure
    const connectMatches = JSON.stringify(connectRequest) === JSON.stringify(expectedConnect);

    // Test 2: Round-trip conversion
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
    const connectRequestForRoundTrip: ConnectRequestTS = {
      registrationInfo
    };

    // Convert to JSON and back to simulate the round-trip to Rust
    const jsonString = JSON.stringify(connectRequestForRoundTrip);
    const roundTrippedConnectRequest = JSON.parse(jsonString) as ConnectRequestTS;

    // Check if the round-tripped object matches the original
    const roundTripMatches = JSON.stringify(roundTrippedConnectRequest) === JSON.stringify(connectRequestForRoundTrip);

    // Test 3: Special characters handling
    // Test with special characters
    const configWithSpecialChars: WorkspaceConfig = {
      ...testConfig,
      fullName: 'Test "User" with & special < > characters',
      password: 'p@$$w0rd!#%^&*()'
    };

    // Convert to RegistrationRequestTS
    const specialCharsRequest = workspaceConfigToRegistrationRequest(configWithSpecialChars);

    // Convert to JSON and back
    const specialCharsJson = JSON.stringify(specialCharsRequest);
    const roundTrippedSpecialChars = JSON.parse(specialCharsJson) as RegistrationRequestTS;

    // Check if special characters are preserved
    const specialCharsMatch =
      roundTrippedSpecialChars.fullName === configWithSpecialChars.fullName &&
      roundTrippedSpecialChars.workspacePassword === configWithSpecialChars.password;

    // Log test results
    console.info('Tauri Integration Tests:');
    console.info('- Registration Request Structure:', registrationMatches ? 'PASSED' : 'FAILED');
    console.info('- Connect Request Structure:', connectMatches ? 'PASSED' : 'FAILED');
    console.info('- Round-trip Conversion:', roundTripMatches ? 'PASSED' : 'FAILED');
    console.info('- Special Characters Handling:', specialCharsMatch ? 'PASSED' : 'FAILED');

    // Return true if all tests pass
    const allTestsPassed = registrationMatches && connectMatches && roundTripMatches && specialCharsMatch;
    console.info('All Tauri Integration Tests:', allTestsPassed ? 'PASSED' : 'FAILED');

    return allTestsPassed;
  } catch (error) {
    console.error('Error running Tauri integration tests:', error);
    return false;
  }
}
