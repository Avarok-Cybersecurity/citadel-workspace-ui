/**
 * Type interoperability testing utilities
 * This file tests the interoperability between TypeScript and Rust types
 */

import {
  workspaceConfigToRegistrationRequest,
  workspaceConfigToConnectRequest,
  ConnectRequestTS,
  RegistrationRequestTS,
  RegistrationInfo
} from './tauri';
import { WorkspaceConfig } from '@/types/workspace';

export interface TestResult {
  testName: string;
  passed: boolean;
  message?: string;
  details?: any;
}

/**
 * Run type interoperability tests
 * Tests various TypeScript types against their Rust counterparts
 */
export async function runTypeInteropTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    // Sample workspace config for testing
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

    // Test 1: WorkspaceConfig → RegistrationRequestTS conversion
    try {
      const registrationRequest = workspaceConfigToRegistrationRequest(testConfig);
      const expectedRegistration = {
        workspaceIdentifier: '127.0.0.1:12345',
        workspacePassword: 'test-password',
        securityLevel: 2,  // Notice this is a number, not string
        securityMode: 1,
        encryptionAlgorithm: 0,
        kemAlgorithm: 0,
        sigAlgorithm: 0,
        headerObfuscatorMode: 0,
        fullName: 'Test User',
        username: 'testuser',
        profilePassword: 'test-profile-password'
      };

      // Check if all fields match
      const regMatches = JSON.stringify(registrationRequest) === JSON.stringify(expectedRegistration);
      results.push({
        testName: 'WorkspaceConfig → RegistrationRequestTS',
        passed: regMatches,
        message: regMatches
          ? 'All fields correctly converted'
          : 'Field mismatch between WorkspaceConfig and RegistrationRequestTS',
        details: regMatches ? undefined : {
          actual: registrationRequest,
          expected: expectedRegistration
        }
      });
    } catch (error) {
      results.push({
        testName: 'WorkspaceConfig → RegistrationRequestTS',
        passed: false,
        message: `Error during conversion: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Test 2: WorkspaceConfig → ConnectRequestTS conversion
    try {
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

      // Check if all fields match
      const connectMatches = JSON.stringify(connectRequest) === JSON.stringify(expectedConnect);
      results.push({
        testName: 'WorkspaceConfig → ConnectRequestTS',
        passed: connectMatches,
        message: connectMatches
          ? 'All fields correctly converted'
          : 'Field mismatch between WorkspaceConfig and ConnectRequestTS',
        details: connectMatches ? undefined : {
          actual: connectRequest,
          expected: expectedConnect
        }
      });
    } catch (error) {
      results.push({
        testName: 'WorkspaceConfig → ConnectRequestTS',
        passed: false,
        message: `Error during conversion: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Test 3: Field name mapping (camelCase to snake_case)
    try {
      const connectRequest = workspaceConfigToConnectRequest(testConfig);
      const hasServerAddress = 'server_address' in connectRequest.registrationInfo;
      const hasServerPassword = 'server_password' in connectRequest.registrationInfo;
      const hasFullName = 'full_name' in connectRequest.registrationInfo;

      const fieldNameMappingCorrect = hasServerAddress && hasServerPassword && hasFullName;

      results.push({
        testName: 'Field name mapping (camelCase to snake_case)',
        passed: fieldNameMappingCorrect,
        message: fieldNameMappingCorrect
          ? 'Field names correctly mapped from camelCase to snake_case'
          : 'Field name mapping issues detected',
        details: fieldNameMappingCorrect ? undefined : {
          missingFields: [
            !hasServerAddress ? 'server_address' : null,
            !hasServerPassword ? 'server_password' : null,
            !hasFullName ? 'full_name' : null
          ].filter(Boolean)
        }
      });
    } catch (error) {
      results.push({
        testName: 'Field name mapping (camelCase to snake_case)',
        passed: false,
        message: `Error testing field name mapping: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Test 4: String to number conversion
    try {
      const registrationRequest = workspaceConfigToRegistrationRequest(testConfig);
      const securityLevelCorrect = typeof registrationRequest.securityLevel === 'number' &&
        registrationRequest.securityLevel === 2;

      results.push({
        testName: 'String to number conversion',
        passed: securityLevelCorrect,
        message: securityLevelCorrect
          ? 'String values correctly converted to numbers'
          : 'String to number conversion failed',
        details: securityLevelCorrect ? undefined : {
          securityLevel: {
            type: typeof registrationRequest.securityLevel,
            value: registrationRequest.securityLevel,
            expected: {
              type: 'number',
              value: 2
            }
          }
        }
      });
    } catch (error) {
      results.push({
        testName: 'String to number conversion',
        passed: false,
        message: `Error testing string to number conversion: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Test 5: Special characters handling
    try {
      const configWithSpecialChars: WorkspaceConfig = {
        ...testConfig,
        fullName: 'Test "User" with & special < > characters',
        password: 'p@$$w0rd!#%^&*()'
      };

      const registrationRequest = workspaceConfigToRegistrationRequest(configWithSpecialChars);
      const connectRequest = workspaceConfigToConnectRequest(configWithSpecialChars);

      const specialCharsPreservedReg = registrationRequest.fullName === configWithSpecialChars.fullName &&
        registrationRequest.workspacePassword === configWithSpecialChars.password;

      const specialCharsPreservedConn = connectRequest.registrationInfo.full_name === configWithSpecialChars.fullName &&
        connectRequest.registrationInfo.server_password === configWithSpecialChars.password;

      results.push({
        testName: 'Special characters handling',
        passed: specialCharsPreservedReg && specialCharsPreservedConn,
        message: specialCharsPreservedReg && specialCharsPreservedConn
          ? 'Special characters correctly preserved'
          : 'Special character handling issues detected',
        details: (specialCharsPreservedReg && specialCharsPreservedConn) ? undefined : {
          registrationRequestIssues: !specialCharsPreservedReg,
          connectRequestIssues: !specialCharsPreservedConn
        }
      });
    } catch (error) {
      results.push({
        testName: 'Special characters handling',
        passed: false,
        message: `Error testing special character handling: ${error instanceof Error ? error.message : String(error)}`
      });
    }

  } catch (error) {
    // Add a general error test result if something unexpected happens
    results.push({
      testName: 'General type interoperability',
      passed: false,
      message: `Unexpected error during type interoperability tests: ${error instanceof Error ? error.message : String(error)}`
    });
  }

  // Log results to console for debugging
  console.info('Type Interoperability Test Results:', results);

  return results;
}
