/**
 * Tauri Test Helper
 * 
 * This module provides utilities for testing the interaction between Rust and TypeScript.
 * It includes functions to mock the Tauri API and simulate events from Rust.
 */

import { vi } from 'vitest';
import { mockTauriApi, mockTauriEvent, simulateRustCall } from './mock-server';

// Original Tauri import
import * as tauriOriginal from '@tauri-apps/api';

// Mock the Tauri API for testing
export const mockTauriForTesting = () => {
  // Save the original modules
  const originalTauri = { ...tauriOriginal };
  
  // Create a mock invoke function
  const mockInvoke = vi.fn().mockImplementation(async (command: string, args: any) => {
    switch (command) {
      case 'connect':
        return mockTauriApi.connect(args);
      case 'register':
        return mockTauriApi.register(args);
      case 'list_known_servers':
        return mockTauriApi.listKnownServers();
      default:
        throw new Error(`Unimplemented mock command: ${command}`);
    }
  });
  
  // Mock the Tauri modules
  vi.mock('@tauri-apps/api', async () => {
    const actual = await vi.importActual('@tauri-apps/api');
    return {
      ...actual,
      invoke: mockInvoke
    };
  });
  
  vi.mock('@tauri-apps/api/event', async () => {
    return {
      listen: mockTauriEvent.listen
    };
  });
  
  // Return functions to help with testing
  return {
    // Reset the mock API call tracking
    resetMocks: () => {
      mockTauriApi.resetCalls();
      mockInvoke.mockClear();
    },
    
    // Get the mock invoke function for assertions
    getMockInvoke: () => mockInvoke,
    
    // Simulate events from Rust
    simulateRustCall,
    
    // Restore the original Tauri modules
    restoreOriginalTauri: () => {
      vi.doUnmock('@tauri-apps/api');
      vi.doUnmock('@tauri-apps/api/event');
    }
  };
};

// Test utility to verify that a TypeScript function was called with the expected arguments
export const expectTauriCommandCalled = (
  mockInvoke: ReturnType<typeof vi.fn>,
  command: string,
  args?: any
) => {
  expect(mockInvoke).toHaveBeenCalled();
  
  const calls = mockInvoke.mock.calls.filter(call => call[0] === command);
  expect(calls.length).toBeGreaterThan(0);
  
  if (args) {
    const matchingCall = calls.find(call => {
      const callArgs = call[1];
      return Object.keys(args).every(key => {
        return JSON.stringify(callArgs[key]) === JSON.stringify(args[key]);
      });
    });
    
    expect(matchingCall).toBeDefined();
  }
};

// Helper to wait for a specified time
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to wait for a condition to be true
export const waitFor = async (
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return;
    }
    await wait(interval);
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
};
