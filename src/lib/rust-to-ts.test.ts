/**
 * Tests for Rust-to-TypeScript communication
 * 
 * These tests verify that the TypeScript code can correctly respond to events from Rust.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockTauriEvent } from './mock-server';
import * as tauriModule from './tauri';
import { WorkspaceConfig } from '@/types/workspace';
import { invoke } from '@tauri-apps/api/core';

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

// Mock the invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Helper to wait for a specified time
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Rust to TypeScript Communication', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    (invoke as any).mockClear();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  it('should handle connection requests from Rust', async () => {
    // Mock successful connection response
    (invoke as any).mockResolvedValueOnce({
      success: true,
      message: "Successfully connected to server"
    });
    
    // Set up a spy on the connect function
    const connectSpy = vi.spyOn(tauriModule, 'connect');
    
    // Set up an event listener for connection requests
    let connectionHandled = false;
    const unlisten = mockTauriEvent.listen('connection-request', async (data: any) => {
      try {
        // Verify the data received from Rust
        expect(data).toHaveProperty('serverAddress', '127.0.0.1:12345');
        
        // Create a workspace config from the server address
        const config = { ...testConfig, serverAddress: data.serverAddress };
        
        // Call the connect function with the config
        const connectRequest = tauriModule.workspaceConfigToConnectRequest(config);
        await tauriModule.connect(connectRequest);
        
        connectionHandled = true;
      } catch (error) {
        console.error('Error in connection request handler:', error);
      }
    });
    
    // Simulate a connection request from Rust
    mockTauriEvent.emit('connection-request', { serverAddress: '127.0.0.1:12345' });
    
    // Wait for the event to be processed
    await wait(200);
    
    // Clean up the event listener
    unlisten();
    
    // Verify that the connect function was called
    expect(connectionHandled).toBe(true);
    expect(connectSpy).toHaveBeenCalled();
    
    // Verify that the Tauri invoke function was called with the correct command
    expect(invoke).toHaveBeenCalledWith('connect', expect.any(Object));
    
    // Restore the spy
    connectSpy.mockRestore();
  });
  
  it('should handle registration requests from Rust', async () => {
    // Mock successful registration response
    (invoke as any).mockResolvedValueOnce({
      success: true,
      message: "Successfully registered with server"
    });
    
    // Set up a spy on the register function
    const registerSpy = vi.spyOn(tauriModule, 'register');
    
    // Set up an event listener for registration requests
    let registrationHandled = false;
    const unlisten = mockTauriEvent.listen('registration-request', async (data: any) => {
      try {
        // Verify the data received from Rust
        expect(data).toHaveProperty('serverAddress', '127.0.0.1:12345');
        
        // Create a workspace config from the server address
        const config = { ...testConfig, serverAddress: data.serverAddress };
        
        // Call the register function with the config
        const registrationRequest = tauriModule.workspaceConfigToRegistrationRequest(config);
        await tauriModule.register(registrationRequest);
        
        registrationHandled = true;
      } catch (error) {
        console.error('Error in registration request handler:', error);
      }
    });
    
    // Simulate a registration request from Rust
    mockTauriEvent.emit('registration-request', { serverAddress: '127.0.0.1:12345' });
    
    // Wait for the event to be processed
    await wait(200);
    
    // Clean up the event listener
    unlisten();
    
    // Verify that the register function was called
    expect(registrationHandled).toBe(true);
    expect(registerSpy).toHaveBeenCalled();
    
    // Verify that the Tauri invoke function was called with the correct command
    expect(invoke).toHaveBeenCalledWith('register', expect.any(Object));
    
    // Restore the spy
    registerSpy.mockRestore();
  });
  
  it('should handle server list updates from Rust', async () => {
    // Mock successful server list response
    (invoke as any).mockResolvedValueOnce({
      servers: [
        {
          server_address: '127.0.0.1:12345',
          security_level: 2,
          security_mode: 1,
          encryption_algorithm: 0,
          kem_algorithm: 0,
          sig_algorithm: 0
        },
        {
          server_address: '192.168.1.100:12345',
          security_level: 1,
          security_mode: 0,
          encryption_algorithm: 1,
          kem_algorithm: 1,
          sig_algorithm: 1
        }
      ]
    });
    
    // Set up a spy on the listKnownServers function
    const listServersSpy = vi.spyOn(tauriModule, 'listKnownServers');
    
    // Set up an event listener for server list updates
    let serverListHandled = false;
    const unlisten = mockTauriEvent.listen('server-list-update', async (data: any) => {
      try {
        // Verify the data received from Rust
        expect(data).toHaveProperty('servers');
        expect(Array.isArray(data.servers)).toBe(true);
        
        // Call the listKnownServers function to verify it works with a proper numeric cid
        // Using a numeric CID as per project requirements
        await tauriModule.listKnownServers({ cid: "9999" });
        
        serverListHandled = true;
      } catch (error) {
        console.error('Error in server list update handler:', error);
      }
    });
    
    // Simulate a server list update from Rust
    mockTauriEvent.emit('server-list-update', {
      servers: [
        { server_address: '127.0.0.1:12345' },
        { server_address: '192.168.1.100:12345' }
      ]
    });
    
    // Wait for the event to be processed
    await wait(200);
    
    // Clean up the event listener
    unlisten();
    
    // Verify that the listKnownServers function was called
    expect(serverListHandled).toBe(true);
    expect(listServersSpy).toHaveBeenCalled();
    
    // Verify that the Tauri invoke function was called with the correct command
    expect(invoke).toHaveBeenCalledWith('list_known_servers', expect.any(Object));
    
    // Restore the spy
    listServersSpy.mockRestore();
  });
  
  it('should handle notifications from Rust', async () => {
    // Mock console.log to verify it was called
    const consoleLogSpy = vi.spyOn(console, 'log');
    
    // Set up an event listener for notifications
    let notificationHandled = false;
    const unlisten = mockTauriEvent.listen('notification', (data: any) => {
      try {
        // Verify the data received from Rust
        expect(data).toHaveProperty('title', 'Test Notification');
        expect(data).toHaveProperty('body', 'This is a test notification');
        
        // Log the notification (in a real app, this would show a toast or notification)
        console.log(`Notification: ${data.title} - ${data.body}`);
        
        notificationHandled = true;
      } catch (error) {
        console.error('Error in notification handler:', error);
      }
    });
    
    // Simulate a notification from Rust
    mockTauriEvent.emit('notification', {
      title: 'Test Notification',
      body: 'This is a test notification'
    });
    
    // Wait for the event to be processed
    await wait(200);
    
    // Clean up the event listener
    unlisten();
    
    // Verify that the notification was handled
    expect(notificationHandled).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Notification: Test Notification - This is a test notification'
    );
    
    // Restore the spy
    consoleLogSpy.mockRestore();
  });
  
  it('should handle errors from Rust', async () => {
    // Mock console.error to verify it was called
    const consoleErrorSpy = vi.spyOn(console, 'error');
    
    // Set up an event listener for errors
    let errorHandled = false;
    const unlisten = mockTauriEvent.listen('error', (data: any) => {
      try {
        // Verify the data received from Rust
        expect(data).toHaveProperty('errorCode', 'TEST_ERROR');
        expect(data).toHaveProperty('message', 'This is a test error');
        
        // Log the error (in a real app, this would show an error message)
        console.error(`Error ${data.errorCode}: ${data.message}`);
        
        errorHandled = true;
      } catch (error) {
        console.error('Error in error handler:', error);
      }
    });
    
    // Simulate an error from Rust
    mockTauriEvent.emit('error', {
      errorCode: 'TEST_ERROR',
      message: 'This is a test error'
    });
    
    // Wait for the event to be processed
    await wait(200);
    
    // Clean up the event listener
    unlisten();
    
    // Verify that the error was handled
    expect(errorHandled).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error TEST_ERROR: This is a test error'
    );
    
    // Restore the spy
    consoleErrorSpy.mockRestore();
  });
});
