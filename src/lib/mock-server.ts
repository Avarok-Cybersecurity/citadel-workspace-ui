/**
 * Mock Server for Testing Tauri-to-TypeScript Communication
 * 
 * This module provides a mock implementation of the internal service
 * that can be used for testing the communication between Rust and TypeScript.
 */

import { BrowserEventEmitter } from './browser-event-emitter';

// Event emitter for simulating events from Rust to TypeScript
export const tauriEventEmitter = new BrowserEventEmitter();

// Mock response data
const mockResponses = {
  connect: {
    success: {
      connected: true,
      message: "Successfully connected to server",
      error: null
    },
    failure: {
      connected: false,
      message: "Failed to connect to server",
      error: "Connection refused"
    }
  },
  register: {
    success: {
      registered: true,
      message: "Successfully registered with server",
      error: null
    },
    failure: {
      registered: false,
      message: "Failed to register with server",
      error: "Registration failed"
    }
  },
  listKnownServers: {
    success: {
      servers: [
        {
          server_address: "127.0.0.1:12345",
          security_level: 2,
          security_mode: 1,
          encryption_algorithm: 0,
          kem_algorithm: 0,
          sig_algorithm: 0
        },
        {
          server_address: "192.168.1.100:12345",
          security_level: 1,
          security_mode: 0,
          encryption_algorithm: 1,
          kem_algorithm: 1,
          sig_algorithm: 1
        }
      ],
      error: null
    },
    failure: {
      servers: [],
      error: "Failed to list known servers"
    }
  }
};

// Mock the Tauri API
export const mockTauriApi = {
  // Track calls to the mock API for testing
  calls: {
    connect: [] as any[],
    register: [] as any[],
    listKnownServers: [] as any[]
  },
  
  // Mock the connect command
  connect: async (request: any) => {
    mockTauriApi.calls.connect.push(request);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    return mockResponses.connect.success;
  },
  
  // Mock the register command
  register: async (request: any) => {
    mockTauriApi.calls.register.push(request);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    return mockResponses.register.success;
  },
  
  // Mock the listKnownServers command
  listKnownServers: async () => {
    mockTauriApi.calls.listKnownServers.push({});
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    return mockResponses.listKnownServers.success;
  },
  
  // Simulate a Rust-initiated event to TypeScript
  simulateRustEvent: (eventName: string, payload: any) => {
    tauriEventEmitter.emit(eventName, payload);
  },
  
  // Reset all call tracking (useful between tests)
  resetCalls: () => {
    mockTauriApi.calls.connect = [];
    mockTauriApi.calls.register = [];
    mockTauriApi.calls.listKnownServers = [];
  }
};

// Mock the Tauri event listener
export const mockTauriEvent = {
  listen: (event: string, callback: (data: any) => void) => {
    tauriEventEmitter.on(event, callback);
    // Return an unlisten function
    return () => {
      tauriEventEmitter.removeListener(event, callback);
    };
  },
  
  // Add emit method to directly trigger events (for testing)
  emit: (event: string, payload: any) => {
    tauriEventEmitter.emit(event, payload);
  }
};

// Helper to simulate Rust calling TypeScript
export const simulateRustCall = {
  // Simulate Rust sending a notification event
  sendNotification: (title: string, body: string) => {
    tauriEventEmitter.emit('notification', { title, body });
  },
  
  // Simulate Rust requesting a connection
  requestConnection: (serverAddress: string) => {
    tauriEventEmitter.emit('connection-request', { serverAddress });
  },
  
  // Simulate Rust requesting registration
  requestRegistration: (serverAddress: string) => {
    tauriEventEmitter.emit('registration-request', { serverAddress });
  },
  
  // Simulate Rust sending an error
  sendError: (errorCode: string, message: string) => {
    tauriEventEmitter.emit('error', { errorCode, message });
  },
  
  // Simulate Rust sending updated server list
  updateServerList: (servers: any[]) => {
    tauriEventEmitter.emit('server-list-update', { servers });
  }
};
