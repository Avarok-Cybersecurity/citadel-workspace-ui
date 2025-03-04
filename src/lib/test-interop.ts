import { 
  workspaceConfigToRegistrationRequest, 
  workspaceConfigToConnectRequest,
  ConnectRequestTS,
  RegistrationRequestTS
} from './tauri';
import { WorkspaceConfig } from '@/types/workspace';

/**
 * This script tests the type interoperability between TypeScript and Rust
 * It can be run in the browser console to verify the conversions
 */

// Create a sample workspace configuration
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

// Test the conversion to RegistrationRequestTS
function testRegistrationRequestConversion() {
  const registrationRequest = workspaceConfigToRegistrationRequest(testConfig);
  
  // Expected structure based on Rust's RegistrationRequestTS
  const expectedRegistrationRequest: RegistrationRequestTS = {
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
  
  // Compare the actual and expected values
  const registrationMatches = 
    registrationRequest.workspaceIdentifier === expectedRegistrationRequest.workspaceIdentifier &&
    registrationRequest.workspacePassword === expectedRegistrationRequest.workspacePassword &&
    registrationRequest.securityLevel === expectedRegistrationRequest.securityLevel &&
    registrationRequest.securityMode === expectedRegistrationRequest.securityMode &&
    registrationRequest.encryptionAlgorithm === expectedRegistrationRequest.encryptionAlgorithm &&
    registrationRequest.kemAlgorithm === expectedRegistrationRequest.kemAlgorithm &&
    registrationRequest.sigAlgorithm === expectedRegistrationRequest.sigAlgorithm &&
    registrationRequest.fullName === expectedRegistrationRequest.fullName &&
    registrationRequest.username === expectedRegistrationRequest.username &&
    registrationRequest.profilePassword === expectedRegistrationRequest.profilePassword;
  
  console.log('Registration Request Conversion Test:', registrationMatches ? 'PASSED' : 'FAILED');
  if (!registrationMatches) {
    console.log('Expected:', expectedRegistrationRequest);
    console.log('Actual:', registrationRequest);
  }
  
  return registrationMatches;
}

// Test the conversion to ConnectRequestTS
function testConnectRequestConversion() {
  const connectRequest = workspaceConfigToConnectRequest(testConfig);
  
  // Expected structure based on Rust's ConnectRequestTS
  const expectedConnectRequest: ConnectRequestTS = {
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
  
  // Compare the actual and expected values
  const connectMatches = 
    connectRequest.registrationInfo.server_address === expectedConnectRequest.registrationInfo.server_address &&
    connectRequest.registrationInfo.server_password === expectedConnectRequest.registrationInfo.server_password &&
    connectRequest.registrationInfo.security_level === expectedConnectRequest.registrationInfo.security_level &&
    connectRequest.registrationInfo.security_mode === expectedConnectRequest.registrationInfo.security_mode &&
    connectRequest.registrationInfo.encryption_algorithm === expectedConnectRequest.registrationInfo.encryption_algorithm &&
    connectRequest.registrationInfo.kem_algorithm === expectedConnectRequest.registrationInfo.kem_algorithm &&
    connectRequest.registrationInfo.sig_algorithm === expectedConnectRequest.registrationInfo.sig_algorithm &&
    connectRequest.registrationInfo.full_name === expectedConnectRequest.registrationInfo.full_name &&
    connectRequest.registrationInfo.username === expectedConnectRequest.registrationInfo.username &&
    connectRequest.registrationInfo.profile_password === expectedConnectRequest.registrationInfo.profile_password;
  
  console.log('Connect Request Conversion Test:', connectMatches ? 'PASSED' : 'FAILED');
  if (!connectMatches) {
    console.log('Expected:', expectedConnectRequest);
    console.log('Actual:', connectRequest);
  }
  
  return connectMatches;
}

// Run the tests
export function runTypeInteropTests() {
  const registrationTestPassed = testRegistrationRequestConversion();
  const connectTestPassed = testConnectRequestConversion();
  
  if (registrationTestPassed && connectTestPassed) {
    console.log('✅ All TypeScript type interoperability tests passed!');
    return true;
  } else {
    console.error('❌ Some TypeScript type interoperability tests failed!');
    return false;
  }
}

// Export test functions for use in the browser console or other test frameworks
export {
  testRegistrationRequestConversion,
  testConnectRequestConversion,
  testConfig
};
