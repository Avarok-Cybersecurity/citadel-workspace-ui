import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupWasmDebugBridge } from './wasm-debug-bridge';

describe('WASM Debug Bridge', () => {
  let capturedLogs: string[] = [];
  const originalConsoleLog = console.log;
  
  beforeEach(() => {
    capturedLogs = [];
    // Mock console.log to capture output
    console.log = vi.fn((message: string) => {
      capturedLogs.push(message);
    });
    
    // Set up the bridge
    setupWasmDebugBridge();
  });
  
  afterEach(() => {
    console.log = originalConsoleLog;
  });
  
  it('should handle plain text', () => {
    window.wasmDebugLog('hello world 123');
    expect(capturedLogs).toContain('sanitized log: hello world 123');
  });
  
  it('should handle pure JSON', () => {
    window.wasmDebugLog('{"key": "value", "bytes": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}');
    // Check that it was processed (exact format depends on formatForDebug implementation)
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('BytesLike'))).toBe(true);
  });
  
  it('should handle JSON at the beginning', () => {
    window.wasmDebugLog('{"key": "value"} hello world 456');
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('hello world 456'))).toBe(true);
  });
  
  it('should handle JSON in the middle', () => {
    window.wasmDebugLog('hello world 123 {"key": "value"} hello world 456');
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('hello world 123'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('hello world 456'))).toBe(true);
  });
  
  it('should handle multiple JSON objects', () => {
    window.wasmDebugLog('start {"key1": "value1"} middle {"key2": "value2"} end');
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('start'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('middle'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('end'))).toBe(true);
  });
  
  it('should handle invalid JSON gracefully', () => {
    window.wasmDebugLog('hello {invalid json} world');
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('hello {invalid json} world'))).toBe(true);
  });
  
  it('should handle nested JSON', () => {
    window.wasmDebugLog('data: {"outer": {"inner": [1, 2, 3]}} processed');
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('data:'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('processed'))).toBe(true);
  });
  
  it('should format byte arrays correctly', () => {
    // Test with a byte array that should be formatted
    window.wasmDebugLog('{"data": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}');
    expect(capturedLogs.some(log => log.includes('BytesLike'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('First 5 bytes'))).toBe(true);
    expect(capturedLogs.some(log => log.includes('Last 5 bytes'))).toBe(true);
  });
  
  it('should handle complex mixed content', () => {
    const complexInput = 'Start {"user": "john", "data": [1, 2, 3]} middle text {"status": "ok"} end';
    window.wasmDebugLog(complexInput);
    
    const sanitizedLog = capturedLogs.find(log => log.includes('sanitized log:'));
    expect(sanitizedLog).toBeDefined();
    expect(sanitizedLog).toContain('Start');
    expect(sanitizedLog).toContain('middle text');
    expect(sanitizedLog).toContain('end');
    expect(sanitizedLog).toContain('user');
    expect(sanitizedLog).toContain('status');
  });
  
  it('should handle arrays as top-level JSON', () => {
    window.wasmDebugLog('[1, 2, 3, 4, 5]');
    expect(capturedLogs.some(log => log.includes('sanitized log:'))).toBe(true);
    // The formatted output might have spaces, so check for the array content more flexibly
    const sanitizedLog = capturedLogs.find(log => log.includes('sanitized log:'));
    expect(sanitizedLog).toBeDefined();
    expect(sanitizedLog).toMatch(/\[.*1.*2.*3.*4.*5.*\]/);
  });
  
  it('should handle edge cases', () => {
    // Empty string
    window.wasmDebugLog('');
    expect(capturedLogs).toContain('sanitized log: ');
    
    // Just whitespace
    capturedLogs = [];
    window.wasmDebugLog('   ');
    expect(capturedLogs).toContain('sanitized log:    ');
    
    // Malformed JSON-like strings
    capturedLogs = [];
    window.wasmDebugLog('{broken json');
    expect(capturedLogs).toContain('sanitized log: {broken json');
  });
});